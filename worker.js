import { parentPort } from "worker_threads";
import axios from "axios-https-proxy-fix";
import { G_Apps, G_DEVs, Ios_Apps, Ios_DEVs } from "./schema.js";
import { connectToMongoDb } from "./mongodbConnection.js";
import logger from "./logger.js";

const IOS_API = process.env.IOS_API + "/api" ?? "http://localhost:3100/api";

let config = {
  platform: "app_store",
  delay: 500,
  new_apps_first: true,
  new_devs_first: true,
  scan_devs: true,
  timeline: true,
};

// establish connection with mongoDB
connectToMongoDb(() => parentPort.postMessage({ key: "setup" }));

// listen to all the event may occur by the main thread
parentPort.on("message", (message) => {
  switch (message.key) {
    case "setup":
      config = { ...config, ...message.data };
      begin();
      break;
    case "config":
      config = { ...config, ...message.data };
      break;
  }
});

function begin() {
  switch (config.platform) {
    case "app_store":
      IOSApp();
      break;
  }
}

function IOSApp() {
  // listen to all the event may occur by the main thread
  parentPort.on("message", (message) => {
    switch (message.key) {
      case "old_app":
        let id;
        if (message.data.country) {
          id = message.data.value + "?country=" + message.data.country;
        } else {
          id = message.data.value;
        }
        exploreApp(id, oldAppResponseHandler, oldAppDone);
        break;
      case "new_app":
        exploreApp(message.data.value, newAppResponseHandler, newAppDone);
        break;
      case "old_dev":
        exploreDev(message.data, oldDevResponseHandler, oldDevDone);
        break;
      case "new_dev":
        exploreDev(message.data, newDevResponseHandler, newDevDone);
        break;
      case "update_app":
        updateApp(message.data);
        break;
      case "create_app":
        message.data.ask = true;
        saveNewApp(message.data);
        break;
    }
  });
  askForApp();
  askForDev();

  // app
  // ✅ Optimized askForDev function
  async function askForDev() {
    console.info("📡Requesting a developer...");
    parentPort.postMessage({ key: "ask_for_dev" });
  }
  async function askForApp() {
    console.log("📡Requesting a new app...");
    parentPort.postMessage({ key: "ask_for_app" });
  }

  async function exploreApp(id, responseHandler, doneHandler) {
    const url = `${IOS_API}/apps/${id}`;
    try {
      const response = await doRequest(url);

      if (response.status === 200) {
        responseHandler(response.data);
        doneHandler(id);
        await sleep(config.delay);
        askForApp();
        return;
      }

      if (
        response.status === 400 &&
        response?.data?.message?.includes("not found")
      ) {
        responseHandler(id);
        doneHandler(id);
      } else {
        console.warn(`Retrying app exploration: ${id}`);
        await sleep(config.delay);
        exploreApp(id, responseHandler, doneHandler);
      }
    } catch (error) {
      console.error(`Error fetching app (${id}):`, error.message);
    }
  }

  async function oldAppResponseHandler(app) {
    try {
      if (typeof app === "string") {
        const dbApp = await Ios_Apps.findOne({ _id: app });

        if (!dbApp) {
          console.warn(`App ${app} not found in database.`);
          return;
        }

        const updates = {
          updated_at: new Date(),
          ...(dbApp.published ? { published: false, removed: new Date() } : {}),
        };

        await Ios_Apps.updateOne({ _id: dbApp.id }, { $set: updates });
        console.log(
          `Old app: ${app} ${dbApp.published ? "suspended" : "updated"}`
        );
        return;
      }

      if (typeof app === "object") {
        const dbApp = await Ios_Apps.findOne({ _id: app.id });
        if (dbApp) updateTheApp(app, dbApp);
        askForSimilarApps(app.id);
      }
    } catch (error) {
      console.error(`Error handling old app response: ${error.message}`);
    }
  }

  async function newAppResponseHandler(app) {
    if (typeof app === "object") {
      console.log("👌 Processing new app...");
      await saveNewApp(app);
      askForSimilarApps(app.id);
    }
  }

  async function saveNewApp(app) {
    try {
      app.type = app.genres.some((genre) =>
        genre?.toLowerCase().includes("game")
      )
        ? "GAME"
        : "APP";

      const newApp = await Ios_Apps.create({
        _id: app.id,
        name: app.title,
        icon: app.icon,
        description: app.description,
        type: app.type,
        categories: app.genres,
        primaryCategory: app.primaryGenre,
        released: app.released,
        updated: app.updated,
        version: app.version,
        requiredOsVersion: app.requiredOsVersion,
        contentRating: app.contentRating,
        size: app.size,
        price: app.price,
        free: app.free,
        currency: app.currency,
        devName: app.developer,
        devId: app.developerId,
        devUrl: app.developerUrl,
        website: app.developerWebsite,
        ratingsValue: app.score?.toFixed(1) || 0,
        currentVersionRatingsValue: app.currentVersionScore?.toFixed(1) || 0,
        currentVersionReviewsCount: app.currentVersionReviews,
        languages: app.languages,
        screenshots: app.screenshots,
        ipadScreenshots: app.ipadScreenshots,
        appletvScreenshots: app.appletvScreenshots,
        AppStoreUrl: app.AppStoreUrl || app.url,
        crawled: new Date(),
        published: true,
        updated_at: new Date(),
      });

      console.info(`✅✨New app saved: ${newApp._id}`);
      if (app.ask) askForSimilarApps(app.id);
    } catch (error) {
      if (error.message.includes("E11000 duplicate key")) {
        updateApp(app);
      } else {
        console.error("❌Failed to save new app:", error.message);
      }
    }
  }
  async function updateTheApp(app, dbApp) {
    const updates = { simpleFields: {}, timeLine: [] };

    function addChange(field, before, after, callback) {
      if (before !== after && before !== undefined && after !== undefined) {
        const change = new Change(before, after, field, "US", "en");
        if (config.timeline) updates.timeLine.unshift(change);
        updates.simpleFields[field] = after;
        if (callback) callback();
      }
    }

    addChange("name", dbApp.name, app.title);
    addChange("pkId", dbApp.pkId, app.appId);
    addChange("icon", dbApp.icon, app.icon);
    addChange("description", dbApp.description, app.description);
    addChange("devName", dbApp.devName, app.developer);
    addChange("devId", dbApp.devId, app.developerId, () =>
      updateDev(dbApp.id, {
        developer: {
          before: { id: dbApp.devId, name: dbApp.devName },
          after: { name: app.developer },
        },
      })
    );
    if (app.developerId == dbApp.devId) {
      updateDev(dbApp.id, {
        developer: {
          before: { id: dbApp.devId, name: dbApp.devName },
          after: { name: app.developer },
        },
      });
    }
    addChange("devEmail", dbApp.devEmail, app.developerEmail);
    addChange("devAddress", dbApp.devAddress, app.developerAddress);
    addChange("devUrl", dbApp.devUrl, app.developerUrl);
    addChange("website", dbApp.website, app.developerWebsite);
    addChange("ratingsValue", dbApp.ratingsValue?.toFixed(1), app.score?.toFixed(1));
    addChange(
      "currentVersionRatingsValue",
      dbApp.currentVersionRatingsValue?.toFixed(1),
      app.currentVersionScore?.toFixed(1)
    );
    addChange(
      "currentVersionReviewsCount",
      dbApp.currentVersionReviewsCount,
      app.currentVersionReviews
    );
    addChange("price", dbApp.price, app.price);
    addChange("size", dbApp.size, app.size);
    addChange("currency", dbApp.currency, app.currency);
    addChange("free", dbApp.free, app.free);
    addChange(
      "requiredOsVersion",
      dbApp.requiredOsVersion,
      app.requiredOsVersion
    );
    addChange("contentRating", dbApp.contentRating, app.contentRating);
    addChange("version", dbApp.version, app.version);
    addChange("recentChanges", dbApp.recentChanges, app.releaseNotes);
    addChange("primaryGenre", dbApp.primaryGenre, app.primaryGenre);

    if (app.primaryGenre) {
      const newType = app.primaryGenre.includes("Games") ? "GAME" : "APP";
      addChange("type", dbApp.type, newType);
    }

    if (app.languages.toString() !== dbApp.languages.toString()) {
      addChange("languages", dbApp.languages, app.languages);
    }

    if (
      app.updated &&
      new Date(app.updated).getTime() !== new Date(dbApp.updated).getTime()
    ) {
      addChange(
        "updated",
        new Date(dbApp.updated).getTime(),
        new Date(app.updated).getTime()
      );
    }

    if (new Date(app.released).getTime() !== new Date(dbApp.released).getTime()) {
      addChange("released", new Date(dbApp.released).getTime(), new Date(app.released).getTime());
    }

    if (!dbApp.published) {
      updates.simpleFields.published = true;
      updates.simpleFields.removed = null;
      addChange("published", false, true);
    }

    updates.simpleFields.updated_at = new Date();

    await Ios_Apps.updateOne(
      { _id: dbApp.id },
      {
        $set: updates.simpleFields,
        $push: {
          timeLine: { $each: updates.timeLine, $position: 0 },
        },
      }
    )
      .then(() => console.info(`✅🅰️ App ${dbApp._id} updated successfully.`))
      .catch((err) =>
        console.error(`❌Error updating app ${dbApp._id}: ${err.message}`)
      );

    return dbApp;
  }
  async function updateApp(app) {
    try {
      const dbApp = await Ios_Apps.findOne({ _id: app.id });

      if (
        dbApp &&
        new Date(dbApp.updated_at).getTime() < new Date().setHours(0, 0, 0, 0)
      ) {
        updateTheApp(app, dbApp);
        askForSimilarApps(app.id);
      }
    } catch (error) {
      console.error(`❌Error updating app ${app.id}: ${error.message}`);
    }
  }

  async function askForSimilarApps(id) {
    const url = `${IOS_API}/apps/${id}/similar`;
    try {
      const response = await doRequest(url);

      if (response.status === 200) {
        await Ios_Apps.updateOne(
          { _id: id },
          { $set: { similarApps: response.data.data.map((app) => app.appId) } }
        );
        console.info(`Similar apps updated for ${id}`);
        handleResponseOfSimilarApps(response.data.data);
      }
    } catch (error) {
      console.error(`Error fetching similar apps for ${id}: ${error.message}`);
    }
  }

  async function handleResponseOfSimilarApps(apps) {
    try {
      parentPort.postMessage({
        key: "the_app_line_verification",
        data: apps,
      });
    } catch (error) {
      console.error("Error handling similar apps:", error.message);
    }
  }

  async function oldAppDone(id) {
    parentPort.postMessage({ key: "old_app_done", data: id });
  }

  async function newAppDone(id) {
    parentPort.postMessage({ key: "new_app_done", data: id });
  }

  // dev

  async function updateDev(app, data) {
    if (!data?.developer) return;

    try {
      const { before: previousDev, after: newDev } = data.developer;

      const dev = await Ios_DEVs.findOne({
        $or: [{ name: previousDev?.name }, { _id: previousDev?.id }],
      });

      if (dev) {
        dev.name = newDev.name;
        await dev.save();
      }
    } catch (error) {
      console.error("❌Error updating developer name:", error.message);
    }
  }

  async function exploreDev(id, responseHandler, doneHandler,stop=false) {
    const devId = encodeURIComponent(id);
    const url = `${IOS_API}/developers/${devId}`;

    try {
      const response = await doRequest(url);

      if (response?.status === 200) {
        responseHandler({ devId: id, apps: response.data });
        doneHandler(id);
        await sleep(config.delay);
        askForDev();
        return;
      }

      if (
        response?.status === 400 &&
        response?.data?.message?.includes("not found")
      ) {
        responseHandler(id);
        doneHandler(id);
        await sleep(config.delay);
        askForDev();
      } else {
        if (!stop) {
          console.warn(`Retrying developer exploration: ${id}`);
          await sleep(config.delay);
          exploreDev(id, responseHandler, doneHandler,true);
        }else{
          responseHandler(id);
          doneHandler(id);
          await sleep(config.delay);
          askForDev();
        }
      }
    } catch (error) {
      console.error(`❌Error fetching developer (${id}):`, error.message);
      handleError(`Unexpected error while fetching developer ${id}`);
    }
  }

  async function oldDevDone(id) {
    parentPort.postMessage({ key: "old_dev_done", data: id });
  }

  async function newDevDone(id) {
    console.log("✅✨ New developer processed.");
    parentPort.postMessage({ key: "new_dev_done", data: id });
  }

  async function oldDevResponseHandler(dev) {
    try {
      if (typeof dev === "string") {
        const dbDev = await Ios_DEVs.findOne({ _id: dev });

        if (!dbDev) {
          console.warn(`Developer ${dev} not found in database.`);
          return;
        }

        if (dbDev.accountState) {
          dbDev.accountState = false;
          dbDev.removed = new Date();
        }

        dbDev.updated_at = new Date();

        if (config.timeline) {
          dbDev.timeLine.unshift({
            date: new Date(),
            before: true,
            after: false,
            field: "accountState",
          });
        }

        await dbDev.save();
        console.log(`☠️Developer ${dev} marked as removed.`);
        return;
      }

      if (typeof dev === "object") {
        const dbDev = await Ios_DEVs.findOne({ _id: dev.devId });

        if (dbDev) {
          if (!dbDev.accountState) {
            dbDev.accountState = true;
            dbDev.removed = null;

            if (config.timeline) {
              dbDev.timeLine.unshift({
                date: new Date(),
                before: false,
                after: true,
                field: "accountState",
              });
            }
          }

          dbDev.updated_at = new Date();
          await dbDev.save();
        }

        handleResponseOfSimilarApps(dev.apps);
      }
    } catch (error) {
      console.error(`❌Error handling old developer response: ${error.message}`);
    }
  }

  async function newDevResponseHandler(dev) {
    if (typeof dev !== "object") return;

    try {
      const _id = dev.devId.toString();

      await executeWithRetry(() =>
        Ios_DEVs.create({
          _id,
          name: dev.apps[0].developer,
          created_at: new Date(),
        })
      );

      console.info("✅✨ New developer saved successfully!");
      handleResponseOfSimilarApps(dev.apps);
    } catch (error) {
      console.error(
        `❌Error saving new developer (${dev.devId}):`,
        error.message
      );
    }
  }

  async function putDevIntoTheLine(dev) {
    console.info("Adding developer to the queue...");
    parentPort.postMessage({ key: "the_dev_line_verification", data: dev });
  }
}

// utils
async function handleError(error) {
  console.error(error);
}

async function doRequest(url) {
  return await axios({
    url,
    method: "GET",
    validateStatus: (status) => status < 500,
  });
}
function executeWithRetry(fn, retries = 3, delay = 2000) {
  return new Promise((resolve, reject) => {
    let attempt = 1;

    function tryExecute() {
      fn()
        .then(resolve) // If successful, resolve the Promise
        .catch((error) => {
          if (error.code === "ECONNRESET" && attempt < retries) {
            console.error(
              `🔴 ECONNRESET error. Retrying... (${attempt}/${retries})`
            );
            attempt++;
            setTimeout(tryExecute, delay); // Wait before retrying
          } else {
            reject(error); // Reject if it's not ECONNRESET or retries exceeded
          }
        });
    }

    tryExecute(); // Start the first attempt
  });
}

async function sleep(number) {
  await new Promise((resolver) => {
    setTimeout(async () => {
      resolver("");
    }, number);
  });
}

// classes
class Change {
  constructor(before, after, field, country, language) {
    this.date = new Date();
    this.before = before;
    this.after = after;
    this.field = field;
    this.country = country;
    this.lang = language;
  }
}
