import { Worker } from "worker_threads";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

import { Config, Ios_Apps, Ios_DEVs } from "./schema.js";
import { connectToMongoDb } from "./mongodbConnection.js";
import logger from "./logger.js";

dotenv.config();

// initial the web server
const app = express();

const IOS_API = process.env.IOS_API;

//establish connection with mongodb
connectToMongoDb(loadingConfig);
let CONFIG = {
  platform: "app_store",
  delay: 500,
  new_apps_first: true,
  new_devs_first: true,
  scan_devs: true,
  timeline: true,
  batch_size: 10000,
};
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
const BATCH_SIZE = CONFIG?.batch_size || 10;
const PARALLEL_FETCHES = 1; // Number of parallel queries
const MAX_RETRIES = 3;
let similarAppsWorkerIndexHandler = 0;
// storage for all workers instances
let EXPLORERS = [];
const TOP_CHARTS_EXPLORERS = [];
// load all the ids one by one and store them on a hashMap
async function addProxies() {
  const ipv4Strings = `82.211.7.142:51524:owenislaa:WnEJVYQZFL
194.87.114.212:51524:owenislaa:WnEJVYQZFL
213.209.130.103:51524:owenislaa:WnEJVYQZFL
178.218.128.203:51524:owenislaa:WnEJVYQZFL
64.43.122.209:51524:owenislaa:WnEJVYQZFL
86.38.177.13:51524:owenislaa:WnEJVYQZFL
77.90.178.105:51524:owenislaa:WnEJVYQZFL
193.124.16.126:51524:owenislaa:WnEJVYQZFL
146.247.113.175:51524:owenislaa:WnEJVYQZFL
45.140.211.221:51524:owenislaa:WnEJVYQZFL`;

  const ipv4proxies = ipv4Strings.split("\n").map((proxy) => proxy.trim());

  const ipv6strings = `109.61.89.1:11509:owenislaa:WnEJVYQZFL
109.61.89.1:10415:owenislaa:WnEJVYQZFL
109.61.89.1:10582:owenislaa:WnEJVYQZFL
109.61.89.1:11382:owenislaa:WnEJVYQZFL
109.61.89.1:10566:owenislaa:WnEJVYQZFL
109.61.89.1:10373:owenislaa:WnEJVYQZFL
109.61.89.1:11525:owenislaa:WnEJVYQZFL
109.61.89.1:11425:owenislaa:WnEJVYQZFL
109.61.89.1:10125:owenislaa:WnEJVYQZFL
109.61.89.1:11625:owenislaa:WnEJVYQZFL
109.61.89.1:10119:owenislaa:WnEJVYQZFL
109.61.89.1:11180:owenislaa:WnEJVYQZFL
109.61.89.1:11438:owenislaa:WnEJVYQZFL
109.61.89.1:11284:owenislaa:WnEJVYQZFL
109.61.89.1:11440:owenislaa:WnEJVYQZFL
109.61.89.1:10722:owenislaa:WnEJVYQZFL
109.61.89.1:11517:owenislaa:WnEJVYQZFL
109.61.89.1:11373:owenislaa:WnEJVYQZFL
109.61.89.1:11290:owenislaa:WnEJVYQZFL
109.61.89.1:11289:owenislaa:WnEJVYQZFL
109.61.89.1:11288:owenislaa:WnEJVYQZFL
109.61.89.1:11624:owenislaa:WnEJVYQZFL
109.61.89.1:11181:owenislaa:WnEJVYQZFL
109.61.89.1:10719:owenislaa:WnEJVYQZFL
109.61.89.1:11184:owenislaa:WnEJVYQZFL
109.61.89.1:10585:owenislaa:WnEJVYQZFL
109.61.89.1:10371:owenislaa:WnEJVYQZFL
109.61.89.1:11533:owenislaa:WnEJVYQZFL
109.61.89.1:11524:owenislaa:WnEJVYQZFL
109.61.89.1:11398:owenislaa:WnEJVYQZFL
109.61.89.1:11626:owenislaa:WnEJVYQZFL
109.61.89.1:10405:owenislaa:WnEJVYQZFL
109.61.89.1:10118:owenislaa:WnEJVYQZFL
109.61.89.1:10583:owenislaa:WnEJVYQZFL
109.61.89.1:11287:owenislaa:WnEJVYQZFL
109.61.89.1:11643:owenislaa:WnEJVYQZFL
109.61.89.1:11283:owenislaa:WnEJVYQZFL
109.61.89.1:11254:owenislaa:WnEJVYQZFL
109.61.89.1:11177:owenislaa:WnEJVYQZFL
109.61.89.1:11516:owenislaa:WnEJVYQZFL
109.61.89.1:11400:owenislaa:WnEJVYQZFL
109.61.89.1:11608:owenislaa:WnEJVYQZFL
109.61.89.1:10728:owenislaa:WnEJVYQZFL
109.61.89.1:11185:owenislaa:WnEJVYQZFL
109.61.89.1:11521:owenislaa:WnEJVYQZFL
109.61.89.1:10375:owenislaa:WnEJVYQZFL
109.61.89.1:10426:owenislaa:WnEJVYQZFL
109.61.89.1:11281:owenislaa:WnEJVYQZFL
109.61.89.1:11372:owenislaa:WnEJVYQZFL
109.61.89.1:11439:owenislaa:WnEJVYQZFL
109.61.89.1:11182:owenislaa:WnEJVYQZFL
109.61.89.1:11510:owenislaa:WnEJVYQZFL
109.61.89.1:10580:owenislaa:WnEJVYQZFL
109.61.89.1:11282:owenislaa:WnEJVYQZFL
109.61.89.1:10581:owenislaa:WnEJVYQZFL
109.61.89.1:11593:owenislaa:WnEJVYQZFL
109.61.89.1:10126:owenislaa:WnEJVYQZFL
109.61.89.1:11255:owenislaa:WnEJVYQZFL
109.61.89.1:10584:owenislaa:WnEJVYQZFL
109.61.89.1:10565:owenislaa:WnEJVYQZFL
109.61.89.1:11399:owenislaa:WnEJVYQZFL
109.61.89.1:10721:owenislaa:WnEJVYQZFL
109.61.89.1:11176:owenislaa:WnEJVYQZFL
109.61.89.1:11261:owenislaa:WnEJVYQZFL
109.61.89.1:11609:owenislaa:WnEJVYQZFL
109.61.89.1:10558:owenislaa:WnEJVYQZFL
109.61.89.1:11442:owenislaa:WnEJVYQZFL
109.61.89.1:10372:owenislaa:WnEJVYQZFL
109.61.89.1:11285:owenislaa:WnEJVYQZFL
109.61.89.1:11441:owenislaa:WnEJVYQZFL
109.61.89.1:11253:owenislaa:WnEJVYQZFL
109.61.89.1:11395:owenislaa:WnEJVYQZFL
109.61.89.1:11531:owenislaa:WnEJVYQZFL
109.61.89.1:11511:owenislaa:WnEJVYQZFL
109.61.89.1:11260:owenislaa:WnEJVYQZFL
109.61.89.1:11502:owenislaa:WnEJVYQZFL
109.61.89.1:11286:owenislaa:WnEJVYQZFL
109.61.89.1:11256:owenislaa:WnEJVYQZFL
109.61.89.1:11417:owenislaa:WnEJVYQZFL
109.61.89.1:11291:owenislaa:WnEJVYQZFL
109.61.89.1:10720:owenislaa:WnEJVYQZFL
109.61.89.1:10403:owenislaa:WnEJVYQZFL
109.61.89.1:10374:owenislaa:WnEJVYQZFL
109.61.89.1:11371:owenislaa:WnEJVYQZFL
109.61.89.1:11396:owenislaa:WnEJVYQZFL
109.61.89.1:11523:owenislaa:WnEJVYQZFL
109.61.89.1:11264:owenislaa:WnEJVYQZFL
109.61.89.1:11178:owenislaa:WnEJVYQZFL
109.61.89.1:11397:owenislaa:WnEJVYQZFL
109.61.89.1:11426:owenislaa:WnEJVYQZFL
109.61.89.1:11522:owenislaa:WnEJVYQZFL
109.61.89.1:11532:owenislaa:WnEJVYQZFL
109.61.89.1:11443:owenislaa:WnEJVYQZFL
109.61.89.1:11252:owenislaa:WnEJVYQZFL
109.61.89.1:11183:owenislaa:WnEJVYQZFL
109.61.89.1:10404:owenislaa:WnEJVYQZFL
109.61.89.1:10559:owenislaa:WnEJVYQZFL
109.61.89.1:10117:owenislaa:WnEJVYQZFL
109.61.89.1:11179:owenislaa:WnEJVYQZFL
109.61.89.1:11642:owenislaa:WnEJVYQZFL`;

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
  await Config.updateOne(
    {},
    { $set: { ipv4proxies: v4proxyObjects, ipv6proxies: v6proxyObjects } }
  ).then((res) => {});
}
async function loadingConfig() {
  addProxies().then(() => {
    console.log("finish adding proxies👌");
  });
  const config = await Config.find().wtimeout(5000);
  CONFIG = { ...CONFIG, ...config[0].as_config };
  appStoreExplorer(
    config[0].as_config,
    config[0].ipv4proxies,
    config[0].ipv6proxies
  );
}

function appStoreExplorer(config, v4proxies, v6proxies) {
  let Config = config;
  let page = Config?.app_page || 0;
  let devPage = Config?.dev_page || 0;
  // config
  addProxies(v4proxies, v6proxies).then(setupTheExplorer);

  const processApp = (app, today, alreadyUpdated, needToBeUpdated) => {
    console.log("processing app : ", app._id);
    if (app.updated_at != undefined && app.updated_at > today) {
      alreadyUpdated++;
      STORAGE.APPS_IDS.set(app._id, { value: true, onProcess: false });
    } else {
      STORAGE.APPS_IDS.set(app._id, {
        value: false,
        onProcess: false,
      });
      needToBeUpdated++;
    }
  };
  async function fetchAppsBatch(
    today,
    alreadyUpdated,
    needToBeUpdated,
    retries = MAX_RETRIES,
    delay = 2000
  ) {
    console.log("applying config scan apps: " + Config.scan_apps);
    if (!Config.scan_apps) return true;

    let allBatchesFinished = false;

    while (!allBatchesFinished) {
      try {
        // 🔹 Fetch multiple batches in parallel
        const fetchPromises = [];
        for (let i = 0; i < PARALLEL_FETCHES; i++) {
          fetchPromises.push(
            Ios_Apps.find({
              updated_at: {
                $gte: new Date("2025-02-19T15:50:00.000Z")
              }
            })
              .select("_id updated_at")
              .skip((page + i) * BATCH_SIZE)
              .limit(BATCH_SIZE)
              .lean()
          );
        }

        const results = await Promise.all(fetchPromises);
        const apps = results.flat(); // Combine all batches into a single array

        if (apps.length === 0) {
          allBatchesFinished = true;
          break;
        }
        logger.info("apps: " + JSON.stringify(apps) );
        // 🔹 Process all apps in parallel (faster than `for` loop)
        await Promise.all(
          apps.map((app) =>
            processApp(app, today, alreadyUpdated, needToBeUpdated)
          )
        );

        page += PARALLEL_FETCHES; // Move to the next set of pages
        retries = MAX_RETRIES; // ✅ Reset retries after a successful batch
        console.log("✅we are in " + page * BATCH_SIZE);
      } catch (error) {
        const Econ = error?.message.includes("ECONNRESET");
        const Bson = error?.message.includes("BSONOffsetError:");
        if (Econ || Bson) {
          if (retries > 0) {
            console.error(
              `🔴 ${Econ ? "ECONNRESET" : "BSONOffsetError"} ECONNRESET error. Retrying in ${delay}ms... (${
                MAX_RETRIES - retries + 1
              }/${MAX_RETRIES})`
            );
            retries--;
            await new Promise((res) => setTimeout(res, delay));
          } else {
            console.error("❌ Connection failed after maximum retries.");
            throw error; // ❌ Stop execution after max retries
          }
        } else {
          throw error; // ❌ If it's another error, stop execution
        }
      }
    }

    console.log("✅ Finished processing all apps.");
    return true;
  }
  const processDev = (dev, today) => {
    console.log("processing dev : ", dev._id);
    if (dev.updated_at && dev.updated_at > today) {
      STORAGE.DEVS_IDS.set(dev._id, {
        value: true,
        onProcess: false,
      });
    } else {
      STORAGE.DEVS_IDS.set(dev._id, {
        value: false,
        onProcess: false,
      });
    }
  };
  async function fetchDevsBatch(today) {
    console.log("applying config scan devs: " + Config.scan_devs);
    if (!Config.scan_devs) return true;
    console.log("we are in " + devPage * BATCH_SIZE);
    const devs = await Ios_DEVs.find()
      .select("_id updated_at")
      .skip(devPage * BATCH_SIZE)
      .limit(BATCH_SIZE)
      .lean(); // Converts Mongoose documents to plain objects (less memory usage)

    if (devs.length === 0) {
      console.log("✅ Finished processing all devs.");
      return true;
    }

    for (const dev of devs) {
      processDev(dev, today);
    }

    devPage++;
    await fetchDevsBatch(); // Prevents blocking the event loop
  }
  // load ids from the database
  async function loadIds(callback) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let alreadyUpdated = 0;
    let needToBeUpdated = 0;
    fetchAppsBatch(today, alreadyUpdated, needToBeUpdated)
      .then(() => {
        console.info("alreadyUpdated : ", alreadyUpdated);
        console.info("needToBeUpdated : ", needToBeUpdated);
        console.info("loading app store apps ids : finish successfully");
        fetchDevsBatch(today).then(() => {
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
    // startTopChartWorker();
    loadIds(() => {
      startWorker();
    });
  }

  // add proxies to the scraper api
  async function addProxies(v4, v6) {
    const proxies = { v4: [], v6: [] };
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

    worker.on("error", (err) => {
      console.error(err);
      worker.terminate();
    });

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
}
async function startWorker() {
  const worker = new Worker("./worker.js");
  EXPLORERS.push(worker);

  worker.on("message", (message) => {
    switch (message.key) {
      case "setup":
        worker.postMessage({
          key: "setup",
          data: {
            ...CONFIG,
            platform: "app_store",
          },
        });
        break;
      // app
      case "ask_for_app":
        if (EXPLORERS.indexOf(worker) !== -1) {
          let stillNewApps = false;

          if (STORAGE.URGENT_APPS_IDS.size > 0 && CONFIG.new_apps_first) {
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
            CONFIG.new_apps_first &&
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
          if (STORAGE.NEW_DEVS_IDS.size > 0 && CONFIG.new_devs_first) {
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

  worker.on("error", (err) => {
    console.error(err);
    worker.terminate();
  });

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
  CONFIG = { ...CONFIG, ...updates };
  EXPLORERS.forEach((worker) => {
    worker.postMessage({
      key: "config",
      data: CONFIG,
    });
  });
};
app.use(express.json());
app.use(cors({ origin: "*" }));
app.get("/status", (req, res) => {
  const status = EXPLORERS.length || TOP_CHARTS_EXPLORERS.length ? true : false;
  res.json({
    status,
    total_apps_loaded: STORAGE.APPS_IDS.size,
    total_db_apps_scanned: STATS.total_db_apps_scanned,
    total_apps_explored: STATS.total_apps_explored,
    total_apps_saved: STATS.total_apps_saved,
    total_apps_at_the_line: STORAGE.NEW_APPS_IDS.size,
    total_dev_loaded: STORAGE.DEVS_IDS.size,
    total_db_devs_scanned: STATS.total_db_devs_scanned,
    total_devs_explored: STATS.total_devs_explored,
    total_devs_saved: STATS.total_devs_saved,
    total_dev_at_the_line: STORAGE.NEW_DEVS_IDS.size,
    total_workers: EXPLORERS.length,
    new_apps_first: CONFIG.new_apps_first,
    new_devs_first: CONFIG.new_devs_first,
    as_top_chart_worker: TOP_CHARTS_EXPLORERS ? true : false,
    delay: CONFIG.delay,
    timeline: CONFIG.timeline,
    time: new Date(),
    start_at: STATS.start_at,
    uptime: calculateUptime(STATS.start_at),
  });
});
function calculateUptime(startDate) {
  const now = new Date(); // Current date and time
  const elapsedMs = now - startDate; // Difference in milliseconds

  // Convert milliseconds to human-readable format
  const seconds = Math.floor((elapsedMs / 1000) % 60);
  const minutes = Math.floor((elapsedMs / (1000 * 60)) % 60);
  const hours = Math.floor((elapsedMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

  return `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}
app.post("/update", async (req, res) => {
  if (req.body.workers) {
    const newTotalWorkers = parseInt(req.body.workers, 10);
    if (typeof newTotalWorkers === "number" && newTotalWorkers >= 0) {
      if (newTotalWorkers < EXPLORERS.length) {
        const workersToRemove = EXPLORERS.splice(newTotalWorkers);
        workersToRemove.forEach((worker) => worker.terminate());
        res.json({ count: EXPLORERS.length });
      } else {
        let numberOfWorkersToBeCreate = newTotalWorkers - EXPLORERS.length;
        for (let i = 0; i < numberOfWorkersToBeCreate; i++) {
          await startWorker();
        }
        res.json({ active: EXPLORERS.length });
      }
    }
  }
  if (req.body.state != undefined) {
    if (req.body.state && EXPLORERS.length === 0) {
      startWorker();
    }
    if (!req.body.state) {
      EXPLORERS = [];
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
  updateConfig(configUpdates);
});

app.listen(process.env.PORT || 8080, () => {
  console.log("server listen to port " + process.env.PORT ?? 8080);
});
