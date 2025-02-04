import { parentPort } from "worker_threads";
import axios from "axios-https-proxy-fix";
import { G_Apps, G_DEVs, Ios_Apps, Ios_DEVs } from "./schema.js";
import { connectToMongoDb } from "./mongodbConnection.js";
import logger from "./logger.js";

const G_API = process.env.G_API + "/api" ?? "http://localhost:3099/api";
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
    case "google_play":
      googlePlay();
      break;
    case "app_store":
      IOSApp();
      break;
  }
}

function googlePlay(){

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

  async function exploreApp(id, responseHandler, doneHandler) {
    let url = `${G_API}/apps/${id}`;
    try {
      const response = await doRequest(url);
      if (response.status === 200) {
        console.info(`Successful response from ${url} :`);
        try {
          responseHandler(response.data);
          doneHandler(id);
        } catch (error) {
          console.log("exploreApp : " + error);
        }
        await sleep(config.delay|| 1000);
        askForApp();
      } else {
        if (response.status === 400) {
          console.warn(`Empty response from ${url} :`, response.data.message);
          if(response.data.message.includes("not found") || response.data.message.includes("Cannot read properties of undefined")){
            try {
              responseHandler(id);
              doneHandler(id);
            } catch (error) {
              console.log("exploreApp : " + error);
            }
            await sleep(config.delay || 1000);
            askForApp();
          }else{
            await sleep(config.delay || 1000);
            exploreApp(id, responseHandler, doneHandler);
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
        const dbApp = await G_Apps.findOne({ _id: app })
        try {
          if (dbApp.published) {
            await G_Apps.updateOne(
              { _id: app },
              {
                $set: {
                  published: false,
                  removed: new Date(),
                  updated_at: new Date(),
                },
              }
            ).then(()=>console.log("app removed")).catch((err) =>
              logger(
                "update app because its removed : " + app + " ERROR : " + err
              )
            );
          } else {
            await G_Apps.updateOne(
              { _id: app },
              {
                $set: {
                  updated_at: new Date(),
                },
              }
            ).then(()=>console.log("update app with no changes")).catch((err) =>
              logger.error(
                "update app with no changes " + app + " ERROR : " + err
              )
            );
          }
        } catch (error) {
          logger.error(
            "find old app that is removed : " + app + " ERROR : " + err
          );
        }
          
      }

      // if the app exist
      if (typeof app === "object") {
        G_Apps.findOne({ _id: app.appId }).then((dbApp) => {
          if (config.timeline) {
            updateTheApp(app, dbApp);
          }
          askForSimilarApps(app.appId);
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
    askForSimilarApps(app.appId);
  }

  async function saveNewApp(app) {  
    const categories = app.categories?.map((category) => category.name);
    let type;
    if (app.genreId) {
      if (app.genreId.includes("GAME") || app.categories.filter(category => { if(category.id?.includes("GAME") || category.name?.includes("Game"))return true })) {
        type = "GAME";
      } else {
        type = "APP";
      }
    }
    G_Apps.create({
      _id: app.appId,
      name: app.title,
      icon: app.icon,
      summary: app.summary,
      description: app.description,
      published: true,
      released: app.released,
      devName: app.developer,
      devId: app.developerId,
      website: app.developerWebsite,
      devEmail: app.developerEmail,
      devAddress: app.developerAddress,
      installs: app.minInstalls,
      installsExact: app.maxInstalls,
      ratingsValue: Number(app.scoreText) || 0,
      ratingsCount: app.ratings,
      reviewsCount: app.reviews,
      price: app.price,
      histogram: app.histogram,
      currency: app.currency,
      free: app.free,
      offersIAP: app.offersIAP,
      IAPRange: app.IAPRange,
      androidVersion: app.androidVersion,
      headerImage: app.headerImage,
      privacyPolicy: app.privacyPolicy,
      screenshots: app.screenshots,
      ads: app.adSupported,
      genre: app.genre,
      updated: app.updated,
      type,
      version: app.version,
      recentChanges: app.recentChanges,
      playstoreUrl: app.url,
      categories,
      contentRating: app.contentRating,
      contentRatingDescription: app.contentRatingDescription,
      comments: app.comments?.length > 0 ? app.comments : [],
      video: app.video,
      videoImage: app.videoImage,
      previewVideo: app.previewVideo,
      preregistered: app.preregister,
      earlyAccessEnabled: app.earlyAccessEnabled,
      isAvailableInPlayPass: app.isAvailableInPlayPass,
      crawled: new Date(),
      updated_at: new Date(),
    })
      .then((app) => {
        // add the app info to the dev
        console.info("new app saved success");
      })
      .catch((err) => console.error("new app failed on save :" + err));
      app.developerId ? putDevIntoTheLine(app.developerId) : null;
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

  async function askForSimilarApps(id) {
    const url = `${G_API}/apps/${id}/similar`;
    try {
      const response = await doRequest(url);
      if (response.status === 200) {
        console.info(`Successful response from ${url} :`);
        G_Apps.updateOne(
          { _id: id },
          { $set: { similarApps: response.data.data.map((app) => app.appId) } }
        )
          .then((res) => console.info("similar apps updated success"))
          .catch((err) => console.error("similar apps update failed : " + err));
        handleResponseOfSimilarApps(response.data.data);
      }
    } catch (err) {
      if (err?.response?.status === 400) {
        console.warn(`Empty response from ${url} :`, err?.response?.message);
      } else {
        console.error(`Unexpected status ${response.status} from ${url} :`);

        handleError(`Unexpected status ${response.status}`);
      }
    }
  }

  async function handleResponseOfSimilarApps(apps) {
    try {
      let ids = apps.map((app) => app.appId);
      parentPort.postMessage({
        key: "the_app_line_verification",
        data: ids,
      });
    } catch (error) {
      logger.error("handleResponseOfSimilarApps : " + apps + " ERROR : " + error);
    }
  }

  async function updateTheApp(app, dbApp) {
    const updates = { simpleFields: {}, timeLine: []};
    if (app.title?.length > 0 && app.title != dbApp.name) {
      const change = new Change([dbApp.name], [app.title], "name", "US", "en");
      config.timeline && dbApp.name ? updates.timeLine.unshift(change) : null;
      // dbApp.name = app.title;
      updates.simpleFields.name = app.title;
    }
    if (app.icon?.length > 0) {
      const iconSplitted = app.icon.split("/");
      if (!dbApp.icon?.includes(iconSplitted[iconSplitted.length - 1])) {
        const change = new Change([dbApp.icon], [app.icon], "icon", "US", "en");
        updates.timeLine.unshift(change);
      }
      // dbApp.icon = app.icon;
      updates.simpleFields.icon = app.icon;
    }
    if (app.summary?.length > 0 && app.summary != dbApp.summary) {
      const change = new Change(
        [dbApp.summary],
        [app.summary],
        "summary",
        "US",
        "en"
      );
      config.timeline && dbApp.summary ? updates.timeLine.unshift(change) : null;
      // dbApp.summary = app.summary;
      updates.simpleFields.summary = app.summary;
    }
    if (app.description?.length > 0 && app.description != dbApp.description) {
      const change = new Change(
        [dbApp.description],
        [app.description],
        "description",
        "US",
        "en"
      );
      config.timeline && dbApp.description
        ? updates.timeLine.unshift(change)
        : null;
      // dbApp.description = app.description;
      updates.simpleFields.description = app.description;
    }
    if (!dbApp.published) {
      updates.simpleFields.published = true;
      updates.simpleFields.removed = null;
      let change = new Change(false, true, "published", "US", "eng");
      config.timeline ? updates.timeLine.unshift(change) : null;
    }
    if ((app.developer?.length > 0) & (app.developer != dbApp.devName)) {
      const change = new Change(
        [dbApp.devName],
        [app.developer],
        "devName",
        "US",
        "en"
      );
      if (dbApp.devName && config.timeline) {
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
      // dbApp.devName = app.developer;
      updates.simpleFields.devName = app.developer;
    }
    if (app.developerId?.length > 0 && app.developerId != dbApp.devId) {
      const change = new Change(
        [dbApp.devId],
        [app.developerId],
        "devId",
        "US",
        "en"
      );
      if (dbApp.devId && config.timeline) updates.timeLine.unshift(change);
      // dbApp.devId = app.developerId;
      updates.simpleFields.devId = app.developerId;
    }
    if (app.developerEmail?.length > 0 && app.developerEmail != dbApp?.devEmail) {
      const change = new Change(
        [dbApp.devEmail],
        [app.developerEmail],
        "devEmail",
        "US",
        "en"
      );
      if (dbApp.devEmail && config.timeline) updates.timeLine.unshift(change);
      // dbApp.devEmail = app.developerEmail;
      updates.simpleFields.devEmail = app.developerEmail;
    }
    if (app.developerAddress?.length > 0 &&app.developerAddress != dbApp?.devAddress) {
      const change = new Change(
        [dbApp.devAddress],
        [app.developerAddress],
        "devAddress",
        "US",
        "en"
      );
      if (dbApp.devAddress && config.timeline) updates.timeLine.unshift(change);
      // dbApp.devAddress = app.developerAddress;
      updates.simpleFields.devAddress = app.developerAddress;
    }
    if (app.developerWebsite?.length > 0 &&app.developerWebsite != dbApp?.website) {
      const change = new Change(
        [dbApp.website],
        [app.developerWebsite],
        "website",
        "US",
        "en"
      );
      if (dbApp.website && config.timeline) updates.timeLine.unshift(change);
      // dbApp.website = app.developerWebsite;
      updates.simpleFields.website = app.developerWebsite;
    }
    if (app.minInstalls > 0 && app.minInstalls != dbApp.installs) {
      const change = new Change(
        [dbApp.installs],
        [app.minInstalls],
        "installs",
        "US",
        "en"
      );
      if (dbApp.installs && config.timeline) updates.timeLine.unshift(change);
      // dbApp.installs = app.minInstalls;
      updates.simpleFields.installs = app.minInstalls;
    }
    if (app.maxInstalls > 0 && app.maxInstalls != dbApp.installsExact) {
      const change = new Change(
        [dbApp.installsExact],
        [app.maxInstalls],
        "installsExact",
        "US",
        "en"
      );
      if (dbApp.installsExact && config.timeline) updates.timeLine.unshift(change);
      // dbApp.installsExact = app.maxInstalls;
      updates.simpleFields.installsExact = app.maxInstalls;
    }
    if (Number(app.scoreText) > 0 && Number(app.scoreText) != dbApp.ratingsValue) {
      const roundedNumber = Number(app.scoreText);
      const change = new Change(
        [dbApp.ratingsValue],
        [roundedNumber],
        "ratingsValue",
        "US",
        "en"
      );
      if (dbApp.ratingsValue && config.timeline) updates.timeLine.unshift(change);
      // dbApp.ratingsValue = roundedNumber;
      updates.simpleFields.ratingsValue = roundedNumber;
    }
    if (app.ratings > 0 && app.ratings != dbApp.ratingsCount) {
      if (dbApp.ratingsCount && config.timeline){
        const change = new Change(
          [dbApp.ratingsCount],
          [app.ratings],
          "ratingsCount",
          "US",
          "en"
        );
        updates.timeLine.unshift(change);
      } 
      // dbApp.ratingsCount = app.ratings;
      updates.simpleFields.ratingsCount = app.ratings;
    }
    if (app.reviews > 0 && app.reviews != dbApp.reviewsCount) {
      const change = new Change(
        [dbApp.reviewsCount],
        [app.reviews],
        "reviewsCount",
        "US",
        "en"
      );
      if (dbApp.reviewsCount && config.timeline) updates.timeLine.unshift(change);
      // dbApp.reviewsCount = app.reviews;
      updates.simpleFields.reviewsCount = app.reviews;
    }
    if (app.price > 0 && app.price != dbApp.price) {
      const change = new Change([dbApp.price], [app.price], "price", "US", "en");
      if (dbApp.price != null && config.timeline) updates.timeLine.unshift(change);
      // dbApp.price = app.price;
      updates.simpleFields.price = app.price;
    }
    if(typeof app.histogram === 'object'){
      // dbApp.histogram = app.histogram;
      updates.simpleFields.histogram = app.histogram;
    }
    if(app.currency?.length > 0 && app.currency != dbApp.currency){
      // dbApp.currency = app.currency;
      updates.simpleFields.currency = app.currency;
    }
    if(typeof app.free === 'boolean' && app.free != dbApp.free){
      const change = new Change([dbApp.free], [app.free], "free", "US", "en");
      if (dbApp.free != undefined && config.timeline) updates.timeLine.unshift(change);
      // dbApp.free = app.free;-
      updates.simpleFields.free = app.free;
    }
    if (app.offersIAP != undefined && app.offersIAP != dbApp.offersIAP) {
      const change = new Change(
        [dbApp.offersIAP],
        [app.offersIAP],
        "offersIAP",
        "US",
        "en"
      );
      config.timeline && dbApp.offersIAP != undefined
        ? updates.timeLine.unshift(change)
        : null;
      // dbApp.offersIAP = app.offersIAP;
      updates.simpleFields.offersIAP = app.offersIAP;
    }
    if (app.IAPRange != null && app.IAPRange != dbApp.IAPRange) {
      const change = new Change(
        [dbApp.IAPRange],
        [app.IAPRange],
        "IAPRange",
        "US",
        "en"
      );
      config.timeline && dbApp.IAPRange ? updates.timeLine.unshift(change) : null;
      // dbApp.IAPRange = app.IAPRange;
      updates.simpleFields.IAPRange = app.IAPRange;
    }
    if(app.androidVersion && app.androidVersion != dbApp.androidVersion){
      const change = new Change(
        [dbApp.androidVersion],
        [app.androidVersion],
        "androidVersion",
        "US",
        "en"
      );
      if (dbApp.androidVersion && config.timeline) updates.timeLine.unshift(change);
      // dbApp.androidVersion = app.androidVersion;
      updates.simpleFields.androidVersion = app.androidVersion;
    }
    if (app.androidVersion?.length > 0 && app.androidVersion != dbApp.androidVersion) {
      const change = new Change(
        [dbApp.androidVersion],
        [app.androidVersion],
        "androidVersion",
        "US",
        "en"
      );
      if (dbApp.androidVersion && config.timeline) updates.timeLine.unshift(change);
      // dbApp.androidVersion = app.androidVersion;
      updates.simpleFields.androidVersion = app.androidVersion;
    }
    if (app.headerImage) {
      const imageSplitted = app.headerImage.split("/");
      if (!dbApp.headerImage?.includes(imageSplitted[imageSplitted.length - 1])) {
        const change = new Change(
          [dbApp.headerImage],
          [app.headerImage],
          "headerImage",
          "US",
          "en"
        );
        if (dbApp.headerImage && config.timeline) updates.timeLine.unshift(change);
      }
      // dbApp.headerImage = app.headerImage;
      updates.simpleFields.headerImage = app.headerImage;
    }
    if (app.privacyPolicy != dbApp.privacyPolicy) {
      const change = new Change(
        [dbApp.privacyPolicy],
        [app.privacyPolicy],
        "privacyPolicy",
        "US",
        "en"
      );
      if (dbApp.privacyPolicy && config.timeline) updates.timeLine.unshift(change);
      // dbApp.privacyPolicy = app.privacyPolicy;
      updates.simpleFields.privacyPolicy = app.privacyPolicy;
    }
    if (app.screenshots?.length > 0) {
      if (dbApp?.screenshots?.length > 0) {
        for (let i = 0; i < dbApp.screenshots.length; i++) {
          let noUpdate = false;
          app.screenshots.map((screen) => {
            let id = screen.split("/");
            id = id[id.length - 1];
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
              ? updates.timeLine.unshift(change)
              : null;
            // dbApp.screenshots = app.screenshots;
            updates.simpleFields.screenshots = app.screenshots;
            break;
          }
        }
      } else {
          // dbApp.screenshots = app.screenshots;
          updates.simpleFields.screenshots = app.screenshots;
      }
    }
    if (app.adSupported != null && app.adSupported != dbApp.ads) {
      const change = new Change(
        [dbApp.ads],
        [app.adSupported],
        "ads",
        "US",
        "en"
      );
      config.timeline && dbApp.ads != undefined
        ? updates.timeLine.unshift(change)
        : null;
      // dbApp.ads = app.adSupported;
      updates.simpleFields.ads = app.adSupported;
    }
    if (app.genre?.length > 0 && app.genre != dbApp.genre) {
      if (dbApp.genre && config.timeline) updates.timeLine.unshift(new Change([dbApp.genre], [app.genre], "genre", "US", "en"));
      // dbApp.genre = app.genre;
      updates.simpleFields.genre = app.genre;
    }
    if (app.updated != null && app.updated != new Date(dbApp.updated).getTime()) {
      config.timeline && dbApp.updated ? updates.timeLine.unshift(new Change(
        [new Date(dbApp.updated).getTime()],
        [new Date(app.updated).getTime()],
        "updated",
        "US",
        "en"
      )) : null;
      // dbApp.updated = app.updated;
      updates.simpleFields.updated = app.updated;
    }
    if(app.genreId){
      let newType = app.genreId.includes("GAME") ? "GAME" : "APP";
      if(config.timeline && dbApp.type && dbApp.type != newType){  
        updates.timeLine.unshift(new Change([dbApp.type], [newType], "type", "US", "en"));
      }
      // dbApp.type = newType;
      updates.simpleFields.type = newType;
    }
    if (app.version?.length > 0 && app.version != dbApp.version) {
      const change = new Change(
        [dbApp.version],
        [app.version],
        "version",
        "US",
        "en"
      );
      config.timeline && dbApp.version ? updates.timeLine.unshift(change) : null;
      // dbApp.version = app.version;
      updates.simpleFields.version = app.version;
    }
    if (app.recentChanges?.length > 0 &&app.recentChanges != dbApp.recentChanges) {
      (config.timeline && dbApp.recentChanges)
        ? updates.timeLine.unshift(new Change(
          [dbApp.recentChanges],
          [app.recentChanges],
          "whatsnew",
          "US",
          "en"
        ))
        : null;
      // dbApp.recentChanges = app.recentChanges;
      updates.simpleFields.recentChanges = app.recentChanges;
    }
    if(app.url && !dbApp.playstoreUrl){
      // dbApp.playstoreUrl = app.url
      updates.simpleFields.playstoreUrl = app.url;
    }
    if (app.categories?.length) {
      app.categories.forEach((category) => {
        if (!dbApp.categories.includes(category.name)) {
          let newCategories = app.categories.map((category) => category.name);
          if (dbApp.categories.length > 0) {
            const change = new Change(
              dbApp.categories,
              newCategories,
              "categories",
              "US",
              "en"
            );
            config.timeline && dbApp.categories
              ? updates.timeLine.unshift(change)
              : null;
          }
          // dbApp.categories = newCategories;
          updates.simpleFields.categories = newCategories;
        }
      });
    }
    if ( app.contentRating?.length > 0 && app.contentRating != dbApp.contentRating) {
      config.timeline && dbApp.contentRating
        ? updates.timeLine.unshift(new Change(
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
    if (app.contentRatingDescription?.length > 0 &&app.contentRatingDescription != dbApp.contentRatingDescription) {
      config.timeline && dbApp.contentRatingDescription
        ? updates.timeLine.unshift(new Change(
          [dbApp.contentRatingDescription],
          [app.contentRatingDescription],
          "contentRatingDescription",
          "US",
          "en"
        ))
        : null;
      // dbApp.contentRatingDescription = app.contentRatingDescription;
      updates.simpleFields.contentRatingDescription = app.contentRatingDescription;
    }
    if (app.comments?.length > 0) {
      // dbApp.comments = app.comments;
      updates.simpleFields.comments = app.comments;
    }
    if (app.video?.length > 0 && app.video != dbApp.video) {
      config.timeline && dbApp.video ? updates.timeLine.unshift(new Change([dbApp.video], [app.video], "video", "US", "en")) : null;
      // dbApp.video = app.video;
      updates.simpleFields.video = app.video;
    }
    if (app.videoImage?.length > 0 && app.videoImage != dbApp.videoImage) {   
      if (config.timeline && dbApp.videoImage) {
        updates.timeLine.unshift(new Change(
          [dbApp.videoImage],
          [app.videoImage],
          "videoImage",
          "US",
          "en"
        ))
      }
      // dbApp.videoImage = app.videoImage;
      updates.simpleFields.videoImage = app.videoImage;
    }
    if (app.previewVideo?.length>0 && app.previewVideo != dbApp.previewVideo) {
      if (config.timeline && dbApp.previewVideo){
        updates.timeLine.unshift(new Change(
          [dbApp.previewVideo],
          [app.previewVideo],
          "previewVideo",
          "US",
          "en"
        ))
      }
      // dbApp.previewVideo = app.previewVideo;
      updates.simpleFields.previewVideo = app.previewVideo;
    }
    if (app.preregister != null && app.preregister != dbApp.preregister) {
      if (config.timeline && (dbApp.preregister != undefined)){
        updates.timeLine.unshift(new Change(
          [dbApp.preregister],
          [app.preregister],
          "preregister",
          "US",
          "en"
        ))
      }
      // dbApp.preregister = app.preregister;
      updates.simpleFields.preregister = app.preregister;
    }
    if (app.earlyAccessEnabled != undefined && app.earlyAccessEnabled != dbApp.earlyAccessEnabled) {
      if(config.timeline && dbApp.earlyAccessEnabled != undefined){
        updates.timeLine.unshift(new Change(
          [dbApp.earlyAccessEnabled],
          [app.earlyAccessEnabled],
          "earlyAccessEnabled",
          "US",
          "en"
        ))
      }
      // dbApp.earlyAccessEnabled = app.earlyAccessEnabled;
      updates.simpleFields.earlyAccessEnabled = app.earlyAccessEnabled;
    }
    if (app.isAvailableInPlayPass != undefined && app.isAvailableInPlayPass != dbApp.isAvailableInPlayPass) {
    
      if(config.timeline && dbApp.isAvailableInPlayPass != undefined){
        updates.timeLine.unshift( new Change(
          [dbApp.isAvailableInPlayPass],
          [app.isAvailableInPlayPass],
          "isAvailableInPlayPass",
          "US",
          "en"
        ))
      }
      // dbApp.isAvailableInPlayPass = app.isAvailableInPlayPass;
      updates.simpleFields.isAvailableInPlayPass = app.isAvailableInPlayPass;
    }
    !dbApp.released ? (updates.simpleFields.released = app.released) : null;
    updates.simpleFields.updated_at = new Date();
      G_Apps.updateOne(
        { _id: app.appId }, { $set: updates.simpleFields, $push: {
          timeLine: { 
            $each: updates.timeLine,
            $position: 0
          }
        }}
      )
      .then((res) => console.info("old app updated success"))
      .catch((err) =>
        console.error("save on db : updated old app  ERROR : " + err)
      );
    return dbApp;
  }

  // dev
  async function askForDev() {
    console.info("wev asked about a developer");
    parentPort.postMessage({
      key: "ask_for_dev",
    });
  }
  async function updateDev(app, data) {
    if (data?.developer) {
      const previousDev = data.developer.before;
      const newDev = data.developer.after;
      G_DEVs.findOne({
        _id: previousDev.id,
      })
        .then((dev) => {
          dev.name = newDev.name;
          dev.save();
        })
        .catch((err) => console.error("update name of dev ERROR :" + err));
      G_Apps.updateMany(
        {
          published: false,
          $or: [{ devId: previousDev.id }, { devName: previousDev.name }],
        },
        {
          $set: { devName: newDev.name },
        }
      );
    }
  }
  async function exploreDev(id, responseHandler, doneHandler) {
    let devId ;
    try {
      devId = decodeURIComponent(id);
    } catch (error) {
      console.log("exploreDev : " + error);
      console.log("exploreDev : ", id);
      devId = id;
    }
    devId = devId.replace(new RegExp(escapeRegExp("+"), 'g'), " ");
    devId = encodeURIComponent(devId);
    console.log("exploreDev : ", id);
    const url = `${G_API}/developers/${devId}`;
    try {
      const response = await doRequest(url);
      if (response.status === 200) {
        console.info(`Successful response from ${url} :`);
        responseHandler(response.data);
        doneHandler(id);
        await sleep(config.delay);
        askForDev();
      }else{
        if (response?.status === 400) {
          console.warn(`Empty response from ${url} :`, response.data.message);
          if(response.data.message.includes("not found") || response.data.message.includes("Cannot read properties of undefined")){
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
    } catch (err) {
        console.error(`Unexpected status ${err.message} from ${url} :`);
        handleError(`Unexpected status ${err.message}`);

    }
  }
  async function oldDevDone(id) {
    parentPort.postMessage({
      key: "old_dev_done",
      data: id,
    });
  }
  async function newDevDone(id) {
    parentPort.postMessage({
      key: "new_dev_done",
      data: id,
    });
  }
  async function oldDevResponseHandler(dev) {
    // if the dev was removed
    if (typeof dev === "string") {
      G_DEVs.findOne({ _id: dev})
        .then((dbDev) => {
          if (dbDev.accountState) {
            if (config.timeline) {
              dbDev.timeLine.unshift({
                date: new Date(),
                before: true,
                after: false,
                field: "accountState",
              });
            }
            dbDev.accountState = false;
            dbDev.removed = new Date();
            dbDev.updated_at = new Date();
            dbDev.save().then(res=>console.log("old g dev updated successfully")).catch((err) => console.log("ERROR on save() : ", err));
          } else {
            dbDev.updated_at = new Date();
            dbDev.save().then(res=>console.log("old g dev updated successfully")).catch((err) => console.log("ERROR on save() : ", err));
          }
        })
        .catch((err) => {
          logger.error("old dev removed : " + dev + "ERROR : " + err);
        });
    }

    // if the dev is active
    if (typeof dev === "object") {
      const id = dev.devId;
      G_DEVs.findOne({ $or: [ { _id: id }, { name: id } ] }).then(
        (dbDev) => {
          if(dbDev){
            if (dbDev.accountState) {
              dbDev.updated_at = new Date();
              dbDev.save().then(res=>console.log("old g dev updated successfully")).catch((err) => {
                logger.error(
                  " update dev with no changes : " + dev + " ERROR : " + err
                );
              });
            } else {
              dbDev.accountState = true;
              dbDev.removed = null;
              dbDev.updated_at = new Date();
              if (config.timeline) {
                dbDev.timeLine.unshift({
                  date: new Date(),
                  before: false,
                  after: true,
                  field: "accountState",
                });
              }
              dbDev.save().then(res=>console.log("old g dev updated successfully")).catch((err) => {
                logger.error(
                  " update dev activated after suspend : " + dev + " ERROR : " + err
                );
              });
            }
          }
        }
      );
      handleResponseOfSimilarApps(dev.apps);
    }
  }
  async function newDevResponseHandler(dev) {
    if (typeof dev === "object") {
      G_DEVs.create({ 
        _id: dev.devId,
        name: dev.apps[0]?.developer,
        created_at: new Date(),
      })
        .then((res) => console.info("new dev saved success"))
        .catch((err) => console.error("new dev failed on save ERROR : ", err+JSON.stringify(dev)));
      handleResponseOfSimilarApps(dev.apps);
    }
  }
  async function putDevIntoTheLine(dev) {
    console.info("new dev");
    parentPort.postMessage({
      key: "the_dev_line_verification",
      data: dev,
    });
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

  async function exploreApp(id, responseHandler, doneHandler) {
    let url = `${IOS_API}/apps/${id}`;
    try {
      const response = await doRequest(url);
      if (response.status === 200) {
        console.info(`Successful response from ${url} :`);
        responseHandler(response.data);
        doneHandler(id);
        await sleep(config.delay);
        askForApp();
      } else {
        if (response.status === 400) {
          console.warn(`Empty response from ${url} :`, response.data.message);
          if(response.data.message.includes("not found")){
            responseHandler(id);
            doneHandler(id);
            await sleep(config.delay);
            askForApp();
          }else{
            await sleep(config.delay);
            exploreApp(id, responseHandler, doneHandler);
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
            const updates = { simpleFields: {} };
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
        console.info("new app saved success");
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
        const currentDate = new Date();
        const today = new Date(
          currentDate.getFullYear() +
            "-" +
            currentDate.getMonth() +
            "-" +
            currentDate.getDate()
        );
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
        console.info(`Successful response from ${url} :`);
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
    if (app.title?.length > 0 && app.title != dbApp.name) {
      const change = new Change([dbApp.name], [app.title], "name", "US", "en");
      config.timeline && dbApp.name ? updates.timeLine.unshift(change)/*dbApp.timeLine.unshift(change)*/ : null;
      //dbApp.name = app.title;
      updates.simpleFields.name = app.title;
    }
    if (app.appId?.length > 0 && app.appId != dbApp.pkId) {
      const change = new Change([dbApp.pkId], [app.appId], "pkId", "US", "en");
      config.timeline && dbApp.pkId ? updates.timeLine.unshift(change)/*dbApp.timeLine.unshift(change)*/ : null;
      //dbApp.pkId = app.appId;
      updates.simpleFields.pkId = app.appId;
    }
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
    if (!dbApp.published) {
      updates.simpleFields.published = true;
      updates.simpleFields.removed = null;
      let change = new Change(false, true, "published", "US", "eng");
      config.timeline ? /*dbApp.timeLine.unshift(change)*/updates.timeLine.unshift(change) : null;
    }
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
    if (app.currentVersionReviews > 0 && app.currentVersionReviews != dbApp.currentVersionReviewsCount) {
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
      if(dbApp.released != app.released){
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
      .then((res) => console.info("old app updated success"))
      .catch((err) =>
        console.error("save on db : updated old app  ERROR : " + err)
      );
    return dbApp;
  }


  // dev
  async function askForDev() {
    console.info("wev asked about a developer");
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
      // Ios_Apps.updateMany(
      //   {
      //     published: false,
      //     $or: [{ devId: previousDev.id }, { devName: previousDev.name }],
      //   },
      //   {
      //     $set: { devName: newDev.name },
      //   }
      // );
    }
  }
  async function exploreDev(id, responseHandler, doneHandler) {
    const devId = encodeURIComponent(id);
    const url = `${IOS_API}/developers/${devId}`;
    try {
      const response = await doRequest(url);
      if (response?.status === 200 || response?.statusText === "OK")  {
        console.info(`Successful response from ${url} :`);
        responseHandler({ devId: id, apps: response.data });
        doneHandler(id);
        await sleep(config.delay);
        askForDev();
      }else{
        if (response?.status === 400) {
          console.warn(`Empty response from ${url} :`, response.data.message);
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
  async function putDevIntoTheLine(dev) {
    console.info("new dev");
    parentPort.postMessage({
      key: "the_dev_line_verification",
      data: dev,
    });
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

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
