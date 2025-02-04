import { Worker } from "worker_threads";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";

import { Config, G_Apps, G_DEVs, Ios_Apps, Ios_DEVs, Steam_Games } from "./schema.js";
import { connectToMongoDb } from "./mongodbConnection.js";
import logger from "./logger.js";

dotenv.config();

// initial the web server
const app = express();

const G_API = process.env.G_API;
const IOS_API = process.env.IOS_API;

//establish connection with mongodb
connectToMongoDb(loadingConfig);

// load all the ids one by one and store them on a hashMap
async function loadingConfig() {
  // addProxies();
  const config = await Config.find().wtimeout(5000);
  appStoreExplorer(config[0].as_config, config[0].ipv4proxies, config[0].ipv6proxies);
  // googlePlayExplorer(config[0].gp_config, config[0].ipv4proxies);
  // Ios_Apps.updateMany({}, { $unset: { "positions": 1}}).then(console.log)
  // syncDevelopers();
  // steamCorrection();
}

function googlePlayExplorer(config, proxies) {
  const STORAGE = {
    APPS_IDS: new Map(),
    NEW_APPS_IDS: new Map(),
    URGENT_APPS_IDS: new Map(),
    DEVS_IDS: new Map(),
    NEW_DEVS_IDS: new Map(),
  };
  const STATS = {
    total_apps_loaded: 0,
    total_db_apps_scanned: 0,
    total_apps_explored: 0,
    total_apps_saved: 0,
    total_apps_at_the_line: 0,
    total_dev_loaded: 0,
    total_db_devs_scanned: 0,
    total_devs_explored: 0,
    total_devs_saved: 0,
    total_dev_at_the_line: 0,
    total_workers: 0,
    start_at: new Date(),
  };
  // storage for all workers instances
  let EXPLORERS = [];
  const TOP_CHARTS_EXPLORERS = [];
  // config
  let Config = config;
  addProxies(proxies).then(setupTheExplorer);

  // load ids from the database
  async function loadIds(callback) {
    const today = new Date();
    today.setDate(today.getDate() - 7);
    let alreadyUpdated = 0;
    let needToBeUpdated = 0;
    today.setHours(0,0);

    G_Apps.find()
      .select(
        "_id released updated_at published country countries earlyAccessEnabled "
      )
      .cursor()
      .eachAsync((app, i) => {
        if (app.updated_at != undefined && app.updated_at > today) {
          alreadyUpdated++;
          STORAGE.APPS_IDS.set(app.id, { value: true, onProcess: false });
        } else {
          STORAGE.APPS_IDS.set(app.id, {
            value: false,
            onProcess: false,
          });
          needToBeUpdated++;
        }
      })
      .then(() => {
        logger.info("alreadyUpdated : "+ alreadyUpdated);
        logger.info("needToBeUpdated : "+ needToBeUpdated);
        logger.info("loading google play apps ids : finish successfully");
        needToBeUpdated = 0;
        alreadyUpdated = 0;
        G_DEVs.find("_id updated_at")
          .cursor()
          .eachAsync((dev, i) => {
            if (dev.updated_at && dev.updated_at > today) {
                STORAGE.DEVS_IDS.set(dev.id, {
                  value: true,
                  onProcess: false
                });
                alreadyUpdated++;
            } else {
              STORAGE.DEVS_IDS.set(dev.id, {
                value: false,
                onProcess: false,
              });
              needToBeUpdated++;
            }
          })
          .then(() => {
            logger.info("alreadyUpdated : "+ alreadyUpdated);
            logger.info("needToBeUpdated : "+ needToBeUpdated);
            logger.info("loading google play Dev's ids : finish successfully");
            callback();
          });
      })
      .catch((err) => {
        console.error("loading google play ids : ", err);
      });
  }

  // setup the explorer
  function setupTheExplorer() {
    // startTopChartWorker();
    loadIds(() => {
      startWorker();
      startWorker();
      startWorker();
      startWorker();
      startWorker();
      startWorker();
      startWorker();
      startWorker();
    });
  }

  // setup and execute a worker
  async function startWorker() {
    const worker = new Worker("./worker.js");
    EXPLORERS.push(worker);

    worker.on("message", (message) => {
      switch (message.key) {
        case "setup":
          worker.postMessage({
            key: "setup",
            data: {
              ...Config,
              platform: "google_play",
            },
          });
          break;
        // app
        case "ask_for_app":
          if (EXPLORERS.indexOf(worker) !== -1) {
            let stillNewApps = false;
            if (
              STORAGE.NEW_APPS_IDS.size > 0 &&
              Config.new_apps_first
            ) {
              for (const [key, val] of STORAGE.NEW_APPS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.NEW_APPS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "new_app",
                    data: { value: key },
                  });
                  stillNewApps = true;
                  break;
                }
              }
            }
            //!stillNewApps
            if (!stillNewApps) {
              for (const [key, val] of STORAGE.APPS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.APPS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "old_app",
                    data: { value: key },
                  });
                  break;
                }
              }
            }
          } else {
            worker.terminate();
          }
          break;

        case "old_app_done":
          STATS.total_db_apps_scanned++;
          STORAGE.APPS_IDS.set(message.data, {
            value: true,
            onProcess: false,
          });
          break;

        case "new_app_done":
          STATS.total_apps_saved++;
          STORAGE.NEW_APPS_IDS.set(message.data, {
            value: true,
            onProcess: false,
          });
          break;

        // dev
        case "ask_for_dev":
          if (EXPLORERS.indexOf(worker) !== -1) {
            let stillNewDevs = false;
            if (STORAGE.NEW_DEVS_IDS.size > 0 && Config.new_devs_first) {
              for (const [key, val] of STORAGE.NEW_DEVS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.NEW_DEVS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "new_dev",
                    data: key,
                  });
                  stillNewDevs = true;
                  break;
                }
              }
            }
            if (!stillNewDevs) {
              for (const [key, val] of STORAGE.DEVS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.DEVS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "old_dev",
                    data: key,
                  });
                  break;
                }
              }
            }
          } else {
            worker.terminate();
          }

          break;

        case "old_dev_done":
          STATS.total_db_devs_scanned++;
          STORAGE.DEVS_IDS.set(message.data, {
            value: true,
            onProcess: false,
          });
          break;

        case "new_dev_done":
          STATS.total_devs_saved++;
          STORAGE.NEW_DEVS_IDS.set(message.data, {
            value: true,
            onProcess: false,
          });
          break;

        case "the_app_line_verification":
          theAppLineVerification(message.data);
          break;

        case "the_dev_line_verification":
          theDevLineVerification(message.data);
          break;
      }
    });

    worker.on("error", (err)=>{
      console.log(err);
      worker.terminate();
    })

    worker.on("exit", (code) => {
      console.log(`Worker stopped with exit code ${code}`);
      const workerIndex = EXPLORERS.indexOf(worker);
      if (workerIndex !== -1) {
        EXPLORERS.splice(workerIndex, 1);
        setTimeout(() => {
          startWorker();
        }, 1000 * 6);
      }
    });
  }

  // setup and execute a top chart worker
  async function startTopChartWorker() {
    const worker = new Worker("./topChartsWorker.js");
    TOP_CHARTS_EXPLORERS.push(worker);
    worker.on("message", (message) => {
      switch (message.key) {
        case "setup":
          worker.postMessage({
            key: "setup",
            data: {
              ...Config,
              platform: "google_play",
            },
          });
          break;
      }
    });
  }
  
  // send the proxies to the scraper api
  async function addProxies(dbProxies) {
    const proxies = [];
    dbProxies.forEach((proxy) => {
      proxies.push(
        `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`
      );
    });
    await fetch(`${G_API}/proxy/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ proxies }),
    })
      .then((response) => response.json())
      .then((response) => console.log(response))
      .catch((err) => {
        console.error(
          "failed to setup proxies for google play api ",
          err.message
        );
        throw err;
      });
  }
  async function theAppLineVerification(ids) {
    ids.forEach((id) => {
      if (
        !STORAGE.APPS_IDS.has(id) &&
        !STORAGE.NEW_APPS_IDS.has(id) &&
        !STORAGE.URGENT_APPS_IDS.has(id)
      ) {
        STATS.total_apps_explored++;
        STORAGE.NEW_APPS_IDS.set(id, {
          value: false,
          onProcess: false,
        });
      }
    });
  }
  async function theDevLineVerification(dev) {
    if (
      !STORAGE.DEVS_IDS.has(dev) &&
      !STORAGE.NEW_DEVS_IDS.has(dev)
    ) {
      STATS.total_devs_explored++;
      STORAGE.NEW_DEVS_IDS.set(dev, {
        value: false,
        onProcess: false,
      });
    }
  }
  const updateConfig = async (updates) => {
    Config = { ...Config, ...updates };
    EXPLORERS.forEach((worker) => {
      worker.postMessage({
        key: "config",
        data: updates,
      });
    });
  };
  return { updateConfig };
}

function appStoreExplorer(config, v4proxies, v6proxies) {
  const STORAGE = {
    APPS_IDS: new Map(),
    NEW_APPS_IDS: new Map(),
    URGENT_APPS_IDS: new Map(),
    DEVS_IDS: new Map(),
    NEW_DEVS_IDS: new Map(),
  };
  const STATS = {
    total_apps_loaded: 0,
    total_db_apps_scanned: 0,
    total_apps_explored: 0,
    total_apps_saved: 0,
    total_apps_at_the_line: 0,
    total_dev_loaded: 0,
    total_db_devs_scanned: 0,
    total_devs_explored: 0,
    total_devs_saved: 0,
    total_dev_at_the_line: 0,
    total_workers: 0,
    start_at: new Date(),
  };
  let similarAppsWorkerIndexHandler = 0;
  // storage for all workers instances
  let EXPLORERS = [];
  const TOP_CHARTS_EXPLORERS = [];
  // config
  let Config = config;
  addProxies(v4proxies, v6proxies).then(setupTheExplorer);

  // health check
  setInterval(() => {
    console.log("explorers : ", EXPLORERS.length);
    console.log("top chart worker : ", TOP_CHARTS_EXPLORERS.length);
    console.log("time : ", new Date());
    console.log("STATS : ", STATS);
  }, 1000 * 60 * 2);


  // load ids from the database
  async function loadIds(callback) {
    const today = new Date();
    today.setHours(0,0);
    today.setDate(today.getDate() - 7);
    let alreadyUpdated = 0;
    let needToBeUpdated = 0;

    Ios_Apps.find()
      .select("_id updated_at description")
      .cursor()
      .eachAsync((app, i) => {
        if ( app.updated_at && app.description && new Date(app.updated_at) > today) {
          alreadyUpdated++;
          STORAGE.APPS_IDS.set(app.id, { value: true, onProcess: false });
        } else {
          needToBeUpdated++;
          STORAGE.APPS_IDS.set(app.id, {
            value: false,
            onProcess: false,
          });
        }
      })
      .then(() => {
        console.info("alreadyUpdated : ", alreadyUpdated);
        console.info("needToBeUpdated : ", needToBeUpdated);
        console.info("loading app store apps ids : finish successfully");
        Ios_DEVs.find()
          .cursor()
          .eachAsync((dev, i) => {
            if (dev.updated_at && dev.updated_at > today) {
              STORAGE.DEVS_IDS.set(dev.id, {
                value: true,
                onProcess: false,
              });
            } else {
              STORAGE.DEVS_IDS.set(dev.id, {
                value: false,
                onProcess: false,
              });
            }
          })
          .then(() => {
            console.info("loading app store Dev's ids : finish successfully");
            callback();
          });
      })
      .catch((err) => {
        console.error("loading app store ids : ", err);
      });
  }

  // setup the explorer
  function setupTheExplorer() {
    // let counter = 0;
    // let games = 0;
    // let apps = 0;
    // Ios_Apps.find("categories type description categories primaryCategory").skip().cursor().eachAsync((app, i) => {
    //   if(app.description && app.categories && app.primaryCategory && app.categories.length > 0){
    //     app.type = (app.categories.find(category=>category?.toLowerCase().includes("game")) || app.primaryCategory.toLocaleLowerCase().includes("game")) ? "GAME" : "APP"
    //     app.type === "GAME" ? games++ : apps++;
    //     app.save().then().catch((err) => console.log(err.message))
    //     counter++;
    //     if(counter % 1000 === 0){
    //       console.log(counter);
    //       console.log("games : ", games);
    //       console.log("apps : ", apps);
    //     }
    //   }
    // })
    startTopChartWorker();
    loadIds(() => {
      startWorker();
      startWorker();
      startWorker();
      startWorker();
    });

   setInterval(()=>{
    EXPLORERS = null;
    EXPLORERS = [];
    startWorker();
    startWorker();
    startWorker();
    startWorker();
    }, 120*60*1000)
  }

  // add proxies to the scraper api
  async function addProxies(v4, v6) {
    const proxies = {v4:[], v6:[]};
    v4.forEach((proxy) => {
      proxies.v4.push(
        `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`
      );
    });
    v6.forEach((proxy) => {
      proxies.v6.push(
        `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`
      );
    });
    console.log(proxies);
    await fetch(`${IOS_API}/proxy/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ proxies }),
    })
      .then((response) => response.json())
      .then((response) => console.log(response))
      .catch((err) => {
        console.error("failed to setup proxies for appStore api ", err.message);
        throw err;
      });
  }

  // setup and execute a worker
  async function startWorker() {
    const worker = new Worker("./worker.js");
    EXPLORERS.push(worker);

    worker.on("message", (message) => {
      switch (message.key) {
        case "setup":
          worker.postMessage({
            key: "setup",
            data: {
              ...Config,
              platform: "app_store",
            },
          });
          break;
        // app
        case "ask_for_app":
          if (EXPLORERS.indexOf(worker) !== -1) {
            let stillNewApps = false;

            if (STORAGE.URGENT_APPS_IDS.size > 0 && Config.new_apps_first) {
              for (const [key, val] of STORAGE.URGENT_APPS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.URGENT_APPS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "old_app",
                    data: {
                      value: key,
                      country: STORAGE.URGENT_APPS_IDS.get(key).country,
                    },
                  });
                  stillNewApps = true;
                  break;
                }
              }
            }
            //NEW_APPS_IDS.size > 0
            if (
              STORAGE.NEW_APPS_IDS.size > 0 &&
              Config.new_apps_first &&
              !stillNewApps
            ) {
              for (const [key, val] of STORAGE.NEW_APPS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.NEW_APPS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "new_app",
                    data: { value: key },
                  });
                  stillNewApps = true;
                  break;
                }
              }
            }
            //!stillNewApps
            if (!stillNewApps) {
              for (const [key, val] of STORAGE.APPS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.APPS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "old_app",
                    data: { value: key },
                  });
                  break;
                }
              }
            }
          } else {
            worker.terminate();
          }
          break;

        case "old_app_done":
          STATS.total_db_apps_scanned++;
          STORAGE.APPS_IDS.set(message.data, {
            value: true,
            onProcess: false,
          });
          break;

        case "new_app_done":
          STATS.total_apps_saved++;
          STORAGE.APPS_IDS.set(message.data, {
            value: true,
            onProcess: false,
          });
          break;

        // dev
        case "ask_for_dev":
          if (EXPLORERS.indexOf(worker) !== -1) {
            let stillNewDevs = false;
            if (STORAGE.NEW_DEVS_IDS.size > 0 && Config.new_devs_first) {
              for (const [key, val] of STORAGE.NEW_DEVS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.NEW_DEVS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "new_dev",
                    data: key,
                  });
                  stillNewDevs = true;
                  break;
                }
              }
            }
            if (!stillNewDevs) {
              for (const [key, val] of STORAGE.DEVS_IDS) {
                if (!val.value && !val.onProcess) {
                  STORAGE.DEVS_IDS.set(key, {
                    value: false,
                    onProcess: true,
                  });
                  worker.postMessage({
                    key: "old_dev",
                    data: key,
                  });
                  break;
                }
              }
            }
          } else {
            worker.terminate();
          }

          break;

        case "old_dev_done":
          STATS.total_db_devs_scanned++;
          STORAGE.DEVS_IDS.set(message.data, {
            value: true,
            onProcess: false,
          });
          break;

        case "new_dev_done":
          STATS.total_devs_saved++;
          STORAGE.NEW_DEVS_IDS.set(message.data, {
            value: true,
            onProcess: false,
          });
          break;

        case "the_app_line_verification":
          theAppLineVerification(message.data);
          break;

        case "the_dev_line_verification":
          theDevLineVerification(message.data);
          break;
      }
    });

    worker.on("error", (err)=>{
      console.error(err);
      worker.terminate();
    })

    worker.on("exit", (code) => {
      console.log(`Worker stopped with exit code ${code}`);
      const workerIndex = EXPLORERS.indexOf(worker);
      if (workerIndex !== -1) {
        EXPLORERS.splice(workerIndex, 1);
        setTimeout(() => {
          startWorker();
        }, 1000 * 6);
      }
    });
  }

  // setup and execute a top chart worker
  async function startTopChartWorker() {
    const worker = new Worker("./topChartsWorker.js");
    TOP_CHARTS_EXPLORERS.push(worker);

    worker.on("message", (message) => {
      switch (message.key) {
        case "setup":
          worker.postMessage({
            key: "setup",
            data: {
              ...Config,
              platform: "app_store",
            },
          });
          break;
      }
    });
  }

  async function theAppLineVerification(apps) {
    for (let i = 0; i < apps.length; i++) {
      const app = apps[i];
      similarAppsWorkerIndexHandler =
        (similarAppsWorkerIndexHandler + 1) % EXPLORERS.length;
      const id = app.id.toString();
      if (STORAGE.APPS_IDS.has(id)) {
        const state = STORAGE.APPS_IDS.get(id);
        if (!state.value && !state.onProcess) {
          STATS.total_db_apps_scanned++;
          STORAGE.APPS_IDS.set(id, {
            value: true,
            onProcess: false,
          });
          EXPLORERS[similarAppsWorkerIndexHandler]?.postMessage({
            key: "update_app",
            data: app,
          });
        }
      } else {
        STATS.total_apps_explored++;
        STORAGE.APPS_IDS.set(id, {
          value: true,
          onProcess: false,
        });
        EXPLORERS[similarAppsWorkerIndexHandler].postMessage({
          key: "create_app",
          data: app,
        });
      }
      const devId = app.developerId.toString();
      if (
        !STORAGE.DEVS_IDS.has(`${devId}`) &&
        !STORAGE.NEW_DEVS_IDS.has(`${devId}`)
      ) {
        STATS.total_devs_explored++;
        STORAGE.NEW_DEVS_IDS.set(devId, {
          value: false,
          onProcess: false,
        });
      }
    }
  }

  async function theDevLineVerification(dev) {
    const devId = dev.toString();
    if (
      !STORAGE.DEVS_IDS.has(`${devId}`) &&
      !STORAGE.NEW_DEVS_IDS.has(`${devId}`)
    ) {
      STATS.total_devs_explored++;
      STORAGE.NEW_DEVS_IDS.set(devId, {
        value: false,
        onProcess: false,
      });
    }
  }

  const updateConfig = async (updates) => {
    Config = { ...Config, ...updates };
    EXPLORERS.forEach((worker) => {
      worker.postMessage({
        key: "config",
        data: updates,
      });
    });
  };
  return { updateConfig };
}

async function syncDevelopers() {
  let hunderdTaosand = 0;
  G_Apps.find({ devId: { $exists: true } })
    .cursor()
    .eachAsync(async (app, i) => {
      if (i % 100000 === 0) {
        console.log(hunderdTaosand * 100000);
        hunderdTaosand++;
      }
      G_DEVs.create({
        _id: app.devId,
        name: app.devName,
      })
        .then()
        .catch((err) => console.error(" save failed ERROR : " + err.message));
    });
}

function addProxies() {
  const ipv4Strings = `64.43.122.109:51523:p1w1l1d1:TMIQXwuKYI
  146.247.112.164:51523:p1w1l1d1:TMIQXwuKYI
  185.241.150.241:51523:p1w1l1d1:TMIQXwuKYI
  82.211.9.22:51523:p1w1l1d1:TMIQXwuKYI
  146.247.113.138:51523:p1w1l1d1:TMIQXwuKYI
  82.211.3.88:51523:p1w1l1d1:TMIQXwuKYI
  64.43.123.147:51523:p1w1l1d1:TMIQXwuKYI
  178.218.129.1:51523:p1w1l1d1:TMIQXwuKYI
  82.211.8.104:51523:p1w1l1d1:TMIQXwuKYI
  178.218.128.30:51523:p1w1l1d1:TMIQXwuKYI
  82.211.7.142:51523:p1w1l1d1:TMIQXwuKYI
  77.90.178.92:51523:p1w1l1d1:TMIQXwuKYI
  45.140.211.248:51523:p1w1l1d1:TMIQXwuKYI
  86.38.177.201:51523:p1w1l1d1:TMIQXwuKYI`

  const ipv4proxies = ipv4Strings.split("\n").map((proxy) => proxy.trim());

  const ipv6strings = `54.36.110.194:10465:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10464:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10467:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10472:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10460:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10466:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10471:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10462:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10470:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10468:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10463:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10461:p1w1l1d1:TMIQXwuKYI
  54.36.110.194:10469:p1w1l1d1:TMIQXwuKYI`

  const ipv6proxies = ipv6strings.split("\n").map((proxy) => proxy.trim());
  let v4proxyObjects = [];
  ipv4proxies.forEach((proxy) => {
    const [ip, port, user, pass] = proxy.split(":");
    v4proxyObjects.push({
      host: ip,
      port,
      username: user,
      password: pass,
    });
  });
  let v6proxyObjects = [];
  ipv6proxies.forEach((proxy) => {
    const [ip, port, user, pass] = proxy.split(":");
    v6proxyObjects.push({
      host: ip,
      port,
      username: user,
      password: pass,
    });
  });
  Config.updateOne(
    {},
    { $set: { ipv4proxies: v4proxyObjects, ipv6proxies: v6proxyObjects } }
  ).then((res) => {});
}

function steamCorrection(){
  Steam_Games.find({}).cursor().eachAsync((game, i) => {
    const newCategories = game.genres || [];
    game.genres = game.categories;
    game.categories = newCategories;
    game.save().then().catch((err) => console.log(err.message))
  })
}



// app.use(
//   "/proxy",
//   createProxyMiddleware({
//     target: G_API,
//     changeOrigin: true,
//   })
// );

app.use(express.json());
app.use(cors({ origin: "*" }));
app.get("/status", (req, res) => {
  const status = expl.length ? true : false;
  res.json({
    status,
    total_apps_loaded: APPS_IDS.size,
    total_db_apps_scanned: total_db_apps_scanned,
    total_apps_explored: total_apps_explored,
    total_apps_saved: total_apps_saved,
    total_apps_at_the_line: NEW_APPS_IDS.size,
    total_dev_loaded: DEVS_IDS.size,
    total_db_devs_scanned,
    total_devs_explored: total_devs_explored,
    total_devs_saved: total_devs_saved,
    total_dev_at_the_line: NEW_DEVS_IDS.size,
    total_workers: Explorers.length,
    new_apps_first: globalConfig.new_apps_first,
    new_devs_first: globalConfig.new_devs_first,
    gp_top_chart_worker: GP_Top_Chart_Worker ? true : false,
    as_top_chart_worker: AS_Top_Chart_Worker ? true : false,
    delay: globalConfig.delay,
    timeline: globalConfig.timeline,
    time: new Date(),
    start_at: START_AT,
  });
});

app.post("/update", async (req, res) => {
  if (req.body.workers) {
    const newTotalWorkers = parseInt(req.body.workers, 10);
    if (typeof newTotalWorkers === "number" && newTotalWorkers >= 0) {
      if (newTotalWorkers < Explorers.length) {
        Explorers = Explorers.splice(0, newTotalWorkers);
        res.json({ count: Explorers.length });
      } else {
        let numberOfWorkersToBeCreate = newTotalWorkers - Explorers.length;
        for (let i = 0; i < numberOfWorkersToBeCreate; i++) {
          await startWorker();
        }
        res.json({ active: Explorers.length });
      }
    }
  }
  if (req.body.state != undefined) {
    if (req.body.state && Explorers.length === 0) {
      startWorker();
    }
    if (!req.body.state) {
      Explorers = [];
    }
  }
  let configUpdates = {};
  if (req.body.delay != undefined) {
    configUpdates.delay = req.body.delay;
  }
  if (req.body.timeline != undefined) {
    configUpdates.timeline = req.body.timeline;
  }
  if (req.body.new_apps_first != undefined) {
    configUpdates.new_apps_first = req.body.new_apps_first;
  }
  if (req.body.new_devs_first != undefined) {
    configUpdates.new_apps_first = req.body.new_apps_first;
  }
  updateWorkersConfig(configUpdates);
});

app.listen(process.env.PORT||8080, () => {
  console.log("server listen to port "+process.env.PORT||8080);
});
