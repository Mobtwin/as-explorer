import { parentPort } from "worker_threads";
import axios from "axios-https-proxy-fix";
import { Ios_Apps, Ios_DEVs } from "./schema.js";
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
  switch(config.platform){
    case "app_store":
      IOSApp();
      break;
  }
}

function IOSApp(){

  // listen to all the event may occur by the main thread
  parentPort.on("message", (message) => {
    switch (message.key) {
      case "old_app":
        let id ;
        if(message.data.country){
          id = message.data.value+"?country="+message.data.country;
        }else{
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
  async function askForApp() {
    console.log("we have ben asked for new one");
    parentPort.postMessage({
      key: "ask_for_app",
    });
  }

  async function exploreApp(id, responseHandler, doneHandler,retry=true) {
    let url = `${IOS_API}/apps/${id}`;
    try {
      const response = await doRequest(url);
      if (response.status === 200) {
        responseHandler(response.data);
        doneHandler(id);
        await sleep(config.delay);
        askForApp();
      } else {
        if (response.status === 400) {
          if(response?.data?.message?.includes("not found") || !retry){
            responseHandler(id);
            doneHandler(id);
            await sleep(config.delay);
            askForApp();
          }else{
            await sleep(config.delay);
            exploreApp(id, responseHandler, doneHandler,false);
          }
      }
    }
    } catch (error) {
      console.error(`Unexpected error on doRequest ${error} from ${url} :`);
    }
  }

  async function oldAppResponseHandler(app) {
    try {
      // if the app was removed
      if (typeof app === "string") {
        Ios_Apps.findOne({ _id: app })
          .then((dbApp) => {
            if (dbApp.published) { 
              Ios_Apps.updateOne(
                { _id: dbApp.id },
                { $set: { 
                  published: false,
                  removed: new Date(),
                  updated_at: new Date(),
                 } }
              ).then(result=>console.log("old google app suspended")).catch((err) => console.error(
                  "update app because its removed : " + app + " ERROR : " + err
                ));
            } else {
              Ios_Apps.updateOne(
                { _id: dbApp.id },
                { $set: { 
                  updated_at: new Date(),
                 } }
              ).then(result=>console.log("old google updated successfully")).catch((err) =>
                logger.error(
                  "update app with no changes " + app + " ERROR : " + err
                )
              );
            }
          })
          .catch((err) => {
            logger.error(
              "find old app that is removed : " + app + " ERROR : " + err
            );
          });
      }

      // if the app exist
      if (typeof app === "object") {
        Ios_Apps.findOne({ _id: app.id }).then((dbApp) => {
            updateTheApp(app, dbApp);
            askForSimilarApps(app.id);
        });
      }
    } catch (err) {
      logger.error(" handling response of old app : ERROR : " + err);
    }
  }

  async function newAppResponseHandler(app) {
    console.log("new app");
    // new app
    if (typeof app === "object") {
      saveNewApp(app);
    }
    askForSimilarApps(app.id);
  }

  async function saveNewApp(app) {
    app.type = (app.genres.find(genre=>genre?.toLowerCase().includes("game")) || app.primaryGenre.toLocaleLowerCase().includes("game")) ? "GAME" : "APP"

    Ios_Apps.create({
      _id: app.id,
      pkId: app.appId,
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
      recentChanges: app.releaseNotes,
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
    })
    .then((dbApp) => {
        console.info(`new app: ${dbApp._id} saved success`);
        if(app.ask)askForSimilarApps(app.id)
    })
    .catch((err) => {
      if (err.message.includes("E11000 duplicate key")) {
        updateApp(app);
      } else {
        console.error("new app failed on save :" + err);
        console.error(JSON.stringify(app));
      }
    });
  }

  async function oldAppDone(id) {
    parentPort.postMessage({
      key: "old_app_done",
      data: id,
    });
  }

  async function newAppDone(id) {
    parentPort.postMessage({
      key: "new_app_done",
      data: id,
    });
  }

  async function updateApp(app){
    Ios_Apps.findOne({ _id: app.id }).then((dbApp) => {
      if(dbApp){
        const today = new Date();
        if(dbApp.updated_at.getTime() < today.getTime()){
          updateTheApp(app, dbApp);
          askForSimilarApps(app.id);
        }
      }
    });
  }

  async function askForSimilarApps(id) {
    const url = `${IOS_API}/apps/${id}/similar`;
    try {
      const response = await doRequest(url);
      if (response.status === 200) {
        Ios_Apps.updateOne(
          { _id: id },
          { $set: { similarApps: response.data.data.map((app) => app.appId) } }
        )
          .then((res) => console.info("similar apps updated success"))
          .catch((err) => console.error("similar apps update failed : " + err));
        handleResponseOfSimilarApps(response.data.data);
      }
    } catch (err) {
      if (err.response?.status === 400) {
        console.warn(`Empty response from ${url} :`, err.response?.message);
      } else {
        console.error(`Unexpected status ${err} from ${url} :`);

        handleError(`Unexpected status ${err}`);
      }
    }
  }

  async function handleResponseOfSimilarApps(apps) {
    try {
      parentPort.postMessage({
        key: "the_app_line_verification",
        data: apps,
      });
    } catch (error) {
      logger.error("handleResponseOfSimilarApps : " + apps + " ERROR : " + error);
    }
  }

  async function updateTheApp(app, dbApp) {
    const updates = { simpleFields: {}, timeLine: [] };
    //title === name of the app
    if (app.title?.length > 0 && app.title != dbApp.name) {
      const change = new Change([dbApp.name], [app.title], "name", "US", "en");
      config.timeline && dbApp.name ? updates.timeLine.unshift(change)/*dbApp.timeLine.unshift(change)*/ : null;
      //dbApp.name = app.title;
      updates.simpleFields.name = app.title;
    }
    // appId === pkId of the app package name
    if (app.appId?.length > 0 && app.appId != dbApp.pkId) {
      const change = new Change([dbApp.pkId], [app.appId], "pkId", "US", "en");
      config.timeline && dbApp.pkId ? updates.timeLine.unshift(change)/*dbApp.timeLine.unshift(change)*/ : null;
      //dbApp.pkId = app.appId;
      updates.simpleFields.pkId = app.appId;
    }
    // icon is the logo of the app
    if (app.icon?.length > 0) {
      const iconSplitted = app.icon.split("/");
      if (!dbApp.icon?.includes(iconSplitted[iconSplitted.length - 2])) {
        const change = new Change([dbApp.icon], [app.icon], "icon", "US", "en");
        //dbApp.timeLine.unshift(change);
        updates.timeLine.unshift(change);
      }
      //dbApp.icon = app.icon;
      updates.simpleFields.icon = app.icon;
    } 
    // description === description of the app
    if (app.description?.length > 0 && app.description != dbApp.description) {
      const change = new Change(
        [dbApp.description],
        [app.description],
        "description",
        "US",
        "en"
      );
      config.timeline && dbApp.description
        ? /*dbApp.timeLine.unshift(change)*/updates.timeLine.unshift(change)
        : null;
      //dbApp.description = app.description;
      updates.simpleFields.description = app.description;
    }
    // published === if the app is published or not
    if (!dbApp.published) {
      updates.simpleFields.published = true;
      updates.simpleFields.removed = null;
      let change = new Change(false, true, "published", "US", "eng");
      config.timeline ? /*dbApp.timeLine.unshift(change)*/updates.timeLine.unshift(change) : null;
    }
    // developer === name of the developer
    if ((app.developer?.length > 0) & (app.developer != dbApp.devName)) {
      const change = new Change(
        [dbApp.devName],
        [app.developer],
        "devName",
        "US",
        "en"
      );
      if (dbApp.devName && config.timeline) {
        //dbApp.timeLine.unshift(change);
        updates.timeLine.unshift(change);
      }
      if (app.developerId == dbApp.devId) {
        updateDev(dbApp.id, {
          developer: {
            before: { id: dbApp.devId, name: dbApp.devName },
            after: { name: app.developer },
          },
        });
      }
      //dbApp.devName = app.developer;
      updates.simpleFields.devName = app.developer;
    }
    // developerId === id of the developer
    if (app.developerId?.length > 0 && app.developerId != dbApp.devId) {
      const change = new Change(
        [dbApp.devId],
        [app.developerId],
        "devId",
        "US",
        "en"
      );
      if (dbApp.devId && config.timeline)updates.timeLine.unshift(change) //dbApp.timeLine.unshift(change);
      //dbApp.devId = app.developerId;
      updates.simpleFields.devId = app.developerId;
    }
    // developerEmail === email of the developer
    if (app.developerEmail?.length > 0 && app.developerEmail != dbApp?.devEmail) {
      const change = new Change(
        [dbApp.devEmail],
        [app.developerEmail],
        "devEmail",
        "US",
        "en"
      );
      if (dbApp.devEmail && config.timeline)updates.timeLine.unshift(change) //dbApp.timeLine.unshift(change);
      //dbApp.devEmail = app.developerEmail;
      updates.simpleFields.devEmail = app.developerEmail;
    }
    // developerAddress === address of the developer
    if (app.developerAddress?.length > 0 &&app.developerAddress != dbApp?.devAddress) {
      const change = new Change(
        [dbApp.devAddress],
        [app.developerAddress],
        "devAddress",
        "US",
        "en"
      );
      if (dbApp.devAddress && config.timeline)updates.timeLine.unshift(change) //dbApp.timeLine.unshift(change);
      //dbApp.devAddress = app.developerAddress;
      updates.simpleFields.devAddress = app.developerAddress;
    }
    // developerUrl === url of the developer
    if (app.developerUrl?.length > 0 &&app.developerUrl != dbApp?.devUrl) {
      const change = new Change(
        [dbApp.devUrl],
        [app.developerUrl],
        "devUrl",
        "US",
        "en"
      );
      if (dbApp.devAddress && config.timeline) updates.timeLine.unshift(change) //dbApp.timeLine.unshift(change);
      // dbApp.devAddress = app.developerAddress;
      updates.simpleFields.devAddress = app.developerAddress;
    }
    // developerWebsite === website of the developer
    if (app.developerWebsite?.length > 0 &&app.developerWebsite != dbApp?.website) {
      const change = new Change(
        [dbApp.website],
        [app.developerWebsite],
        "website",
        "US",
        "en"
      );
      if (dbApp.website && config.timeline)updates.timeLine.unshift(change) //dbApp.timeLine.unshift(change);
      // dbApp.website = app.developerWebsite;
      updates.simpleFields.website = app.developerWebsite;
    }
    // score === ratingsValue of the app
    if (app.score?.toFixed(1) > 0 && app.score?.toFixed(1) != dbApp.ratingsValue) {
      const roundedNumber = app.score?.toFixed(1);
      if (dbApp.ratingsValue && config.timeline)updates.timeLine.unshift(new Change(
        [dbApp.ratingsValue],
        [roundedNumber],
        "ratingsValue",
        "US",
        "en"
      )) 
      updates.simpleFields.ratingsValue = roundedNumber;
    }
    // currentVersionScore === currentVersionRatingsValue of the app
    if (app.currentVersionScore?.toFixed(1) > 0 && app.currentVersionScore?.toFixed(1) != dbApp.currentVersionRatingsValue) {
      const roundedNumber = app.currentVersionScore?.toFixed(1);
      if(dbApp.currentVersionRatingsValue && config.timeline){
        const change = new Change(
          [dbApp.currentVersionRatingsValue],
          [roundedNumber],
          "currentVersionRatingsValue",
          "US",
          "en"
        );
      updates.timeLine.unshift(change);
      }
      updates.simpleFields.currentVersionRatingsValue = roundedNumber;
    }
    // currentVersionReviews === currentVersionReviewsCount of the app
    if (app.currentVersionReviews > 0 && app.currentVersionReviews !== dbApp.currentVersionReviewsCount) {
      if (dbApp.currentVersionReviewsCount && config.timeline){
        const change = new Change(
          [dbApp.currentVersionReviewsCount],
          [app.currentVersionReviews],
          "currentVersionReviewsCount",
          "US",
          "en"
        );
        // dbApp.timeLine.unshift(change);
        updates.timeLine.unshift(change);
      } 
      // dbApp.currentVersionReviewsCount = app.currentVersionReviews;
      updates.simpleFields.currentVersionReviewsCount = app.currentVersionReviews;
    }
    if (app.price > 0 && app.price != dbApp.price) {
      if (dbApp.price != undefined && config.timeline) {
        const change = new Change([dbApp.price], [app.price], "price", "US", "en");
        // dbApp.timeLine.unshift(change);
        updates.timeLine.unshift(change);
      }
      // dbApp.price = app.price;
      updates.simpleFields.price = app.price;
    }
    if (app.size > 0 && app.size != dbApp.size) {
      if (dbApp.size != undefined && config.timeline){
        const change = new Change([dbApp.size], [app.size], "size", "US", "en");
        // dbApp.timeLine.unshift(change);
        updates.timeLine.unshift(change);
      } 
      // dbApp.size = app.size;
      updates.simpleFields.size = app.size;
    }
    if(app.currency?.length > 0 && app.currency != dbApp.currency){
      // dbApp.currency = app.currency;
      updates.simpleFields.currency = app.currency;
    }
    if(typeof app.free === 'boolean' && app.free != dbApp.free){
      const change = new Change([dbApp.free], [app.free], "free", "US", "en");
      if (dbApp.free != undefined && config.timeline)updates.timeLine.unshift(change) //dbApp.timeLine.unshift(change);
      // dbApp.free = app.free;
      updates.simpleFields.free = app.free;
    }
    if(app.requiredOsVersion && app.requiredOsVersion != dbApp.requiredOsVersion){
      const change = new Change(
        [dbApp.requiredOsVersion],
        [app.requiredOsVersion],
        "requiredOsVersion",
        "US",
        "en"
      );
      if (dbApp.requiredOsVersion && config.timeline) updates.timeLine.unshift(change) //dbApp.timeLine.unshift(change);
      // dbApp.requiredOsVersion = app.requiredOsVersion;
      updates.simpleFields.requiredOsVersion = app.requiredOsVersion;
    }
    if(app.contentRating && app.contentRating != dbApp.contentRating){
      const change = new Change(
        [dbApp.contentRating],
        [app.contentRating],
        "contentRating",
        "US",
        "en"
      );
      if (dbApp.contentRating && config.timeline)updates.timeLine.unshift(change) //dbApp.timeLine.unshift(change);
      // dbApp.contentRating = app.contentRating;
      updates.simpleFields.contentRating = app.contentRating;
    }
    if (app.languages.toString() != dbApp.languages.toString()) {
      if (dbApp.languages?.length && config.timeline){
        const change = new Change(
          dbApp.languages,
          app.languages,
          "languages",
          "US",
          "en"
        );
        // dbApp.timeLine.unshift(change);
        updates.timeLine.unshift(change);
      } 
      // dbApp.languages = app.languages;
      updates.simpleFields.languages = app.languages;
    }
    if (app.screenshots?.length > 0) {
      if (dbApp?.screenshots?.length > 0) {
        for (let i = 0; i < dbApp.screenshots.length; i++) {
          let noUpdate = false;
          app.screenshots.map((screen) => {
            let id = screen.split("/");
            id = id[id.length - 2];
            if (dbApp.screenshots[i].includes(id)) {
              noUpdate = true;
            }
          });
          if (!noUpdate) {
            const change = new Change(
              dbApp.screenshots,
              app.screenshots,
              "screenshots",
              "US",
              "en"
            );
            config.timeline && dbApp.screenshots
              ? updates.timeLine.unshift(change)//dbApp.timeLine.unshift(change)
              : null;
            // dbApp.screenshots = app.screenshots;
              updates.simpleFields.screenshots = app.screenshots;
            break;
          }
        }
      } else {
        updates.simpleFields.screenshots = app.screenshots;
      }
    }
    if (app.ipadScreenshots?.length > 0) {
      if (dbApp?.ipadScreenshots?.length > 0) {
        for (let i = 0; i < dbApp.ipadScreenshots.length; i++) {
          let noUpdate = false;
          app.ipadScreenshots.map((screen) => {
            let id = screen.split("/");
            id = id[id.length - 2];
            if (dbApp.ipadScreenshots[i].includes(id)) {
              noUpdate = true;
            }
          });
          if (!noUpdate) {
            const change = new Change(
              dbApp.ipadScreenshots,
              app.ipadScreenshots,
              "ipadScreenshots",
              "US",
              "en"
            );
            config.timeline && dbApp.ipadScreenshots
              ? updates.timeLine.unshift(change)//dbApp.timeLine.unshift(change)
              : null;
            // dbApp.ipadScreenshots = app.ipadScreenshots;
            updates.simpleFields.ipadScreenshots = app.ipadScreenshots;

            break;
          }
        }
      } else {
        updates.simpleFields.ipadScreenshots = app.ipadScreenshots;
      }
    }
    if (app.appletvScreenshots?.length > 0) {
      if (dbApp?.appletvScreenshots?.length > 0) {
        for (let i = 0; i < dbApp.appletvScreenshots.length; i++) {
          let noUpdate = false;
          app.appletvScreenshots.map((screen) => {
            let id = screen.split("/");
            id = id[id.length - 2];
            if (dbApp.appletvScreenshots[i].includes(id)) {
              noUpdate = true;
            }
          });
          if (!noUpdate) {
            const change = new Change(
              dbApp.appletvScreenshots,
              app.appletvScreenshots,
              "appletvScreenshots",
              "US",
              "en"
            );
            config.timeline && dbApp.appletvScreenshots
              ? updates.timeLine.unshift(change)//dbApp.timeLine.unshift(change)
              : null;
            // dbApp.appletvScreenshots = app.appletvScreenshots;
            updates.simpleFields.appletvScreenshots = app.appletvScreenshots;

            break;
          }
        }
      } else {
          // dbApp.appletvScreenshots = app.appletvScreenshots;
          updates.simpleFields.appletvScreenshots = app.appletvScreenshots;
      }
    }
    if (app.updated != null && new Date(app.updated).getTime() != new Date(dbApp.updated).getTime()) {
      config.timeline && dbApp.updated ? /*dbApp.timeLine*/updates.timeLine.unshift(new Change(
        [new Date(dbApp.updated).getTime()],
        [new Date(app.updated).getTime()],
        "updated",
        "US",
        "en"
      )) : null;
      // dbApp.updated = app.updated;
      updates.timeLine.updated = app.updated;
      updates.simpleFields.updated = app.updated;
    }
    if(app.primaryGenre){
      let newType = app.primaryGenre.includes("Games") ? "GAME" : "APP";
      if(config.timeline && dbApp.type && dbApp.type != newType){  
        /*dbApp.timeLine*/updates.timeLine.unshift(new Change([dbApp.type], [newType], "type", "US", "en"));
      }
      dbApp.type = newType;
      (config.timeline && dbApp.primaryGenre)
        ? /*dbApp.timeLine*/updates.timeLine.unshift(new Change(
          [dbApp.primaryGenre],
          [app.primaryGenre],
          "primaryGenre",
          "US",
          "en"
        ))
        : null;
      // dbApp.primaryGenre = app.primaryGenre;
      updates.simpleFields.primaryGenre = app.primaryGenre;
    }
    if (app.version?.length > 0 && app.version != dbApp.version) {
      const change = new Change(
        [dbApp.version],
        [app.version],
        "version",
        "US",
        "en"
      );
      config.timeline && dbApp.version ? /*dbApp.timeLine.unshift(change)*/updates.timeLine.unshift(change) : null;
      // dbApp.version = app.version;
      updates.simpleFields.version = app.version;
    }
    if (app.releaseNotes?.length > 0 &&app.releaseNotes != dbApp.recentChanges) {
      (config.timeline && dbApp.recentChanges)
        ? /*dbApp.timeLine*/updates.timeLine.unshift(new Change(
          [dbApp.recentChanges],
          [app.releaseNotes],
          "whatsnew",
          "US",
          "en"
        ))
        : null;
      // dbApp.recentChanges = app.releaseNotes;
      updates.simpleFields.recentChanges = app.releaseNotes;
    }
    if(app.AppStoreUrl && !dbApp.AppStoreUrl){
      // dbApp.AppStoreUrl = app.AppStoreUrl
      updates.simpleFields.AppStoreUrl = app.AppStoreUrl;
    }
    if (app.genres?.length) {
      app.genres.forEach((category) => {
        if (!dbApp.categories.includes(category)) {
          let newCategories = app.genres;
          if (dbApp.categories.length > 0) {
            const change = new Change(
              dbApp.categories,
              newCategories,
              "categories",
              "US",
              "en"
            );
            config.timeline && dbApp.categories
              ? /*dbApp.timeLine*/updates.timeLine.unshift(change)
              : null;
          }
          // dbApp.categories = newCategories;
          updates.simpleFields.categories = newCategories;
        }
      });
    }
    if ( app.contentRating?.length > 0 && app.contentRating != dbApp.contentRating) {
      config.timeline && dbApp.contentRating
        ? /*dbApp.timeLine*/updates.timeLine.unshift(new Change(
          [dbApp.contentRating],
          [app.contentRating],
          "contentRating",
          "US",
          "en"
        ))
        : null;
      // dbApp.contentRating = app.contentRating;
      updates.simpleFields.contentRating = app.contentRating;
    }
    if(!dbApp.released){
      updates.simpleFields.released = app.released
    }
    else {
      if(new Date(dbApp.released).getTime() !== new Date(app.released).getTime()){
        const change = new Change(
          [dbApp.released],
          [app.released],
          "released",
          "US",
          "en"
        );
        config.timeline && dbApp.released ? updates.timeLine.unshift(change) : null;
        updates.simpleFields.released = app.released;
      }
    }
    !dbApp.released ? (/*dbApp.released = app.released*/ updates.simpleFields.released = app.released) : null;
    // dbApp.updated_at = new Date();
    updates.simpleFields.updated_at = new Date();
    Ios_Apps.updateOne({ _id: dbApp.id }, { $set: updates.simpleFields, $push: {
      timeLine: { 
        $each: updates.timeLine,
        $position: 0
      }
    }})
      .then((res) => console.info(`old app: ${dbApp._id} updated successfully`))
      .catch((err) =>
        console.error("save on db : updated old app  ERROR : " + err)
      );
    return dbApp;
  }


  // dev
  async function askForDev() {
    console.info("Asking for a developer");
    parentPort.postMessage({
      key: "ask_for_dev",
    });
  }
  async function updateDev(app, data) {
    if (data?.developer) {
      const previousDev = data.developer.before;
      const newDev = data.developer.after;
      Ios_DEVs.findOne({
        $or: [{ name: previousDev?.name }, { _id: previousDev.id }],
      })
        .then((dev) => {
          dev.name = newDev.name;
          dev.save();
        })
        .catch((err) => console.error("update name of dev ERROR :" + err));
    }
  }
  async function exploreDev(id, responseHandler, doneHandler) {
    const devId = encodeURIComponent(id);
    const url = `${IOS_API}/developers/${devId}`;
    try {
      const response = await doRequest(url);
      if (response?.status === 200 || response?.statusText === "OK")  {
        responseHandler({ devId: id, apps: response.data });
        doneHandler(id);
        await sleep(config.delay);
        askForDev();
      }else{
        if (response?.status === 400) {
          if(response.data.message.includes("not found")){
            responseHandler(id);
            doneHandler(id);
            await sleep(config.delay);
            askForDev();
          }else{
            await sleep(config.delay);
            exploreDev(id, responseHandler, doneHandler);
          }
        }
      }
    } catch (error) {
        console.error(`Unexpected status ${error?.response?.status} from ${url} :`+error?.message);
        handleError(`Unexpected status ${error?.response?.status}`);
    }
  }
  async function oldDevDone(id) {
    parentPort.postMessage({
      key: "old_dev_done",
      data: id,
    });
  }
  async function newDevDone(id) {
    console.log("new dev done");
    parentPort.postMessage({
      key: "new_dev_done",
      data: id,
    });
  }
  async function oldDevResponseHandler(dev) {
    // if the dev was removed
    if (typeof dev === "string") {
      Ios_DEVs.findOne({ _id: dev })
        .then((dev) => {
          if (dev.accountState) {
            if (config.timeline) {
              dev.timeLine.unshift({
                date: new Date(),
                before: true,
                after: false,
                field: "accountState",
              });
            }
            dev.accountState = false;
            dev.removed = new Date();
            dev.updated_at = new Date();
            dev.save().catch((err) => console.log("ERROR on save() : ", err));
          } else {
            dev.updated_at = new Date();
            dev.save().catch((err) => console.log("ERROR on save() : ", err));
          }
        })
        .catch((err) => {
          logger.error("old dev removed : " + dev + "ERROR : " + err);
        });
    }

    // if the dev is active
    if (typeof dev === "object") {
      Ios_DEVs.findOne({ _id: dev.devId }).then(
        (dev) => {
          
          if (dev.accountState) {
            dev.updated_at = new Date();
            dev.save().catch((err) => {
              logger.error(
                " update dev with no changes : " + dev + " ERROR : " + err
              );
            });
          } else {
            dev.accountState = true;
            dev.removed = null;
            dev.updated_at = new Date();
            if (config.timeline) {
              dev.timeLine.unshift({
                date: new Date(),
                before: false,
                after: true,
                field: "accountState",
              });
            }
            dev.save().catch((err) => {
              logger.error(
                " update dev activated after suspend : " + dev + " ERROR : " + err
              );
            });
          }
        }
      );
      handleResponseOfSimilarApps(dev.apps);
    }
  }
  async function newDevResponseHandler(dev) {
    if (typeof dev === "object") {
      const _id = dev.devId.toString();
      Ios_DEVs.create({
        _id,
        name: dev.apps[0].developer,
        created_at: new Date(),
      })
        .then((res) => console.info("new dev saved success"+res))
        .catch((err) => console.error("new dev failed on save ERROR : ", err, dev.devId+dev.apps[0].developerId));
      handleResponseOfSimilarApps(dev.apps);
    }
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
