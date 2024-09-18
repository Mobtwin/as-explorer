import { parentPort } from "worker_threads";
import axios from "axios";
import {
  Config,
  Constants,
  G_Apps,
  G_TOP_CHART,
  Ios_Apps,
  Ios_Top_chart,
} from "./schema.js";
import { connectToMongoDb } from "./mongodbConnection.js";
import logger from "./logger.js";
import { MongooseError } from "mongoose";

const G_API = process.env.G_API + "/api";
const IOS_API = process.env.IOS_API + "/api";

let config = {
  platform: "space",
  top_chart_checkpoint: null,
  top_chart_scanned_today: null,
};

let g_constants = {};
let ios_constants = {};
let countries = [];

connectToMongoDb(() => parentPort.postMessage({ key: "setup" }));

// listen to all the event may occur by the main thread
parentPort.on("message", (message) => {
  switch (message.key) {
    case "setup":
      config = { ...config, ...message.data };
      loadConstants();
      /*Object.keys(g_store).forEach((key) => {
        g_constants[key] = [];
        Object.keys(g_store[key]).forEach((key2) => {
          g_constants[key].push({ ...g_store[key][key2], key: key2 });
        });
      }); 

      Object.keys(app_store).forEach((key) => {
        ios_constants[key] = [];
        Object.keys(app_store[key]).forEach((key2) => {
          ios_constants[key].push({ ...app_store[key][key2], key: key2 });
        });
      });

      countries = g_countries;

      Constants.create({
        version: config.version,
        g_play: g_constants,
        app_store: ios_constants,
        countries: countries,
      })
        .then(() => {
          console.log("constants created");
        })
        .catch(console.log);*/

      break;
    case "config":
      config = { ...config, ...message.data };
      break;
  }
});

function loadConstants() {
  Constants.findOne({}).then((constants) => {
    g_constants = constants.g_play;
    ios_constants = constants.app_store;
    countries = constants.countries;
    begin();
  });
}

async function doRequest(url) {
  return axios({
    url,
    method: "GET",
    validateStatus: (status) => status < 500,
  });
}

async function begin() {
  console.log("begin");
  if (config.platform === "google_play") {
    gPlay();
  }
  if (config.platform === "app_store") {
    //Ios_Apps.updateMany({}, { $unset: { ranking: "" } }).then(console.log).catch(console.log);
    appStore();
  }
}

async function getListApps(url) {
  const response = await doRequest(url);
  return response.data.data;
}

async function gPlay() {
  let checkpoints = config.top_chart_checkpoint.split(" ");
  let resetCounter = 3;
  let saveCounter = 3;

  async function scanCollection(index) {
    let on = false;
    let top_chart_checkpoint = config.top_chart_checkpoint.split(" ")[index];
    console.log(top_chart_checkpoint);
    let collection = g_constants.collection[index];
    for (let key in g_constants.category) {
      let category = g_constants.category[key];
      for (let i = 0; i < countries.length; i++) {
        const country = countries[i];
        if (
          collection.code + category.code + country.code ===
          top_chart_checkpoint
        ) {
          on = true;
          if (top_chart_checkpoint != collection.code + "aaAL") {
            continue;
          }
        }
        if (on) {
          let params = `?collection=${collection.value}&country=${country.code}&num=500`;
          if (category.value != null) {
            params += `&category=${category.value}`;
          }
          const url = `${G_API}/apps${params}`;

          try {
            const apps = await getListApps(url);
            if (apps?.length > 0) {
              await updateGPAppRanking(apps, country, collection, category);
            }
          } catch (error) {
            logger.error("get List Apps : " + url + " : " + error);
            throw error;
          }
          const pta = collection.code + category.code + country.code;
          updateCheckpoint(index, pta);
        }
      }
    }
    end();
  }
  async function updateCheckpoint(index, value) {
    checkpoints[index] = value;
    const newCheckpoint = checkpoints.join(" ");
    if (saveCounter < 1) {
      await Config.updateMany(
        {},
        {
          $set: {
            "gp_config.top_chart_checkpoint": newCheckpoint,
          },
        }
      ).catch(logger.err);
      saveCounter = 3;
    }
    saveCounter--;
  }
  function end() {
    if (resetCounter < 1) {
      Config.updateMany(
        {},
        {
          $set: {
            "gp_config.top_chart_scanned_today": true,
            "gp_config.top_chart_checkpoint": "baaaAL caaaAL daaaAL",
          },
        }
      ).catch(logger.err);
    }
    resetCounter--;
  }

  scanCollection(0);
  scanCollection(1);
  scanCollection(2);
}

async function appStore() {
  let checkpoints = config.top_chart_checkpoint.split(" ");
  let resetCounter = 3;
  let saveCounter = 3;
  async function scanCollection(index) {
    let on = false;
    const top_chart_checkpoint = config.top_chart_checkpoint.split(" ")[index];
    console.log(top_chart_checkpoint);
    let collection = ios_constants.collection[index];
    let errorCounter = 100;
    for (let key in ios_constants.category) {
      let category = ios_constants.category[key];
      for (let i = 0; i < countries.length; i++) {
        const country = countries[i];
        if (
          collection.code + category.code + country.code ===
          top_chart_checkpoint
        ) {
          on = true;
          if (top_chart_checkpoint != collection.code + "aaAL") {
            continue;
          }
        }

        if (on) {
          let params = `?collection=${collection.value}&country=${country.code}&num=500&fullDetail=true`;
          if (category.value != null) {
            params += `&category=${category.value}`;
          }
          const url = `${IOS_API}/apps${params}`;
          // console.log(url);
          try {
            const apps = await getListApps(url);
            if (apps?.length > 0) {
              updateIosAppRanking(apps, country, collection, category);
              errorCounter = 100;
            } else {
              errorCounter--;
              if (errorCounter <= 0) {
                break;
              }
            }
          } catch (err) {
            logger.error("get List Apps : " + url + " : " + err);
            throw err;
          }
          const pta = collection.code + category.code + country.code;
          updateCheckpoint(index, pta);
        }
      }
      if (errorCounter <= 0) {
        break;
      }
    }
    end();
  }

  async function updateCheckpoint(index, value) {
    checkpoints[index] = value;
    const newCheckpoint = checkpoints.join(" ");
    if (saveCounter < 1) {
      await Config.updateMany(
        {},
        {
          $set: {
            "as_config.top_chart_checkpoint": newCheckpoint,
          },
        }
      ).catch(logger.err);
      saveCounter = 3;
    }
    saveCounter--;
  }
  function end() {
    if (resetCounter < 1) {
      Config.updateMany(
        {},
        {
          $set: {
            "as_config.top_chart_scanned_today": true,
            "as_config.top_chart_checkpoint": "iaaaAL kaaaAL maaaAL",
          },
        }
      ).catch(logger.err);
    }
    resetCounter--;
  }

  scanCollection(1);
  scanCollection(2);
  scanCollection(0);
}

async function updateGPAppRanking(apps, country, collection, category) {
  let newCreated = 0;
  let newUpdated = 0;
  const countryCode = country.code;
  const categoryCode = category.code;
  const collectionCode = collection.code;
  const path = collectionCode + categoryCode + countryCode;
  await G_TOP_CHART.findOne({
    _id: path,
  }).then(async (topChart) => {
    let newList = [];
    for (const [index, app] of apps.entries()) {
      const newApp = {
        _id: app.appId,
        rank: index + 1,
        name: app.title,
        icon: app.icon,
      };
      const oldRank = topChart?.list.find((app) => app._id === newApp._id);
      if (oldRank) {
        newApp.previousRank = oldRank?.rank;
      }
      const appDb = await G_Apps.findOne({ _id: newApp._id }).select("countries released installs installsExact dailyInstalls positions topIn").lean();
      if (appDb) {
        const updates = {
          simpleFields: {},
          timeLine: [],
          positions: [],
          toUpdate: true,
        };
        newApp.released = appDb.released;
        newApp.installs = appDb.installs || 0;
        newApp.installsExact = appDb.installsExact || 0;
        newApp.dailyInstalls = appDb.dailyInstalls || 0;

        const isCountryExist = appDb?.countries?.includes(countryCode) || undefined;
        if (!isCountryExist) {
          updates.simpleFields.countries = [countryCode].concat(appDb.countries || []);
        }else{

        }

        if (oldRank?.rank != newApp.rank) {
          const index = appDb.positions?.indexOf(
            (position) => position.id === path
          );
          if (index != -1) {
            updates.positions.unshift({
              _id: path,
              rank: newApp.rank,
              date: new Date(),
            });
            updates.toUpdate = false;
          } else {
            updates.positions.unshift({
              _id: path,
              rank: newApp.rank,
              date: new Date(),
            });
          }
          const currentDate = new Date();
          currentDate.setDate(currentDate.getDate() - 2);
          if (
            !appDb.topIn ||
            appDb.topIn.date.getTime() < currentDate.getTime() ||
            appDb.topIn.rank > newApp.rank
          ) {
            updates.simpleFields.topIn = {
              _id: path,
              rank: newApp.rank,
              date: new Date(),
            };
          }
        }
        if (updates.toUpdate) {
          G_Apps.updateOne(
            { _id: newApp._id, "positions.$._id": path },
            {
              $set: updates.simpleFields,
              $set: {
                "positions.$": updates.positions[0],
              },
            }
          ).catch((err) =>
            console.error("save appDb on updateTopChart : " + err)
          );
        } else {
          G_Apps.updateOne(
            { _id: newApp._id },
            {
              $set: updates.simpleFields,
              $push: {
                positions: {
                  $each: updates.positions,
                  $position: 0,
                },
              },
            }
          ).catch((err) =>
            console.error("save appDb on updateTopChart : " + err)
          );
        }
        newUpdated++;
        newList.push(newApp);
      } else {
        const fullDApp = (await getGAppDetails(newApp._id, countryCode)).data;
        newApp.released = fullDApp.released;
        newApp.installs = fullDApp.maxInstalls || 0;
        newList.push(newApp);
        const newPosition = {
          _id: path,
          rank: index + 1,
          date: new Date(),
        };
        fullDApp.positions = [newPosition];
        fullDApp.topIn = {
          _id: path,
          rank: newApp.rank,
          date: new Date(),
        };
        saveNewGApp(fullDApp, countryCode);
        newCreated++;
      }
    }
    if (topChart) {
      topChart.list = newList;
      topChart.updated_at = new Date();
      return topChart
        .save()
        .catch((err) =>
          console.error("save topChart on updateTopChart : " + err)
        );
    } else {
      G_TOP_CHART.create({
        _id: path,
        list: newList,
        updated_at: new Date(),
      }).catch((err) =>
        console.error("create new topChart on updateTopChart : " + err)
      );
    }
  });
  console.log(
    "google play: new created: " +
      newCreated +
      " new updated: " +
      newUpdated +
      " " +
      collection.value +
      " " +
      category.value +
      " " +
      country.name
  );
}

async function getGAppDetails(appId, countryCode) {
  const url = `${G_API}/apps/${appId}`;
  const result = await axios({
    url,
    method: "GET",
    validateStatus: (status) => status < 500,
  });
  if (result.status === 200) {
    return result;
  } else {
    const url = `${G_API}/apps/${appId}?country=${countryCode}`;
    return await axios({
      url,
      method: "GET",
      validateStatus: (status) => status < 500,
    });
  }
}

async function updateIosAppRanking(apps, country, collection, category) {
  let newCreated = 0;
  let newUpdated = 0;
  const countryCode = country.code;
  const categoryCode = category.code;
  const collectionCode = collection.code;
  const path = collectionCode + categoryCode + countryCode;

  await Ios_Top_chart.findOne({
    _id: path,
  }).then(async (topChart) => {

    let newList = [];
    for (const [index, app] of apps.entries()) {
      const newApp = {
        _id: app.id,
        rank: index + 1,
        name: app.title,
        icon: app.icon,
      };
      const oldRank = topChart?.list.find((app) => app._id == newApp._id);
      if (topChart && oldRank) {
        newApp.previousRank = oldRank?.rank;
      }
      const appDb = await Ios_Apps.findOne({ _id: newApp._id }).select("countries released currentVersionReviewsCount categories positions topIn").lean();
      if (appDb) {
        const dbAppUpdates = {
          fields: {},
          position: {},
          toUpdate: true,
        };

        newApp.released = appDb.released;
        newApp.ratingsCount = appDb.currentVersionReviewsCount || 0;
        newApp.categories = appDb.categories;

        const isCountryExist = appDb?.countries?.includes(countryCode) || undefined;
        if (!isCountryExist) {
          dbAppUpdates.fields.countries = [countryCode].concat(appDb.countries || []);
        }
        
        if (oldRank?.rank != newApp.rank) {
          const index = appDb.positions?.indexOf(
            (position) => position._id === path
          );
          if (index != -1) {
            dbAppUpdates.position = {
              _id: path,
              rank: newApp.rank,
              date: new Date(),
            };
            dbAppUpdates.toUpdate = false;
          } else {
            dbAppUpdates.position = {
              _id: path,
              rank: newApp.rank,
              date: new Date(),
            };
          }
          const currentDate = new Date();
          currentDate.setDate(currentDate.getDate() - 2);
          if (
            !appDb.topIn ||
            appDb.topIn.date.getTime() < currentDate.getTime() ||
            appDb.topIn.rank > newApp.rank
          ) {
            dbAppUpdates.fields.topIn = {
              _id: path,
              rank: newApp.rank,
              date: new Date(),
            };
          }
        }
        if (dbAppUpdates.toUpdate) {
          Ios_Apps.updateOne(
            { _id: newApp._id, "positions._id": path },
            {
              $set: {
                ...dbAppUpdates.fields,
                "positions.$": dbAppUpdates.position,
              },
              $push: {
                countries: countryCode,
              },
            }
          ).catch((err) =>
            console.error("save appDb on updateTopChart : " + err)
          );
        } else {
          Ios_Apps.updateOne(
            { _id: newApp._id },
            {
              $set: dbAppUpdates.fields,
              $push: {
                positions: {
                  $each: [dbAppUpdates.position],
                  $position: 0,
                },
                countries: countryCode,
              },
            }
          ).catch((err) =>
            console.error("save appDb on updateTopChart : " + err)
          );
        }
        newUpdated++;
        newList.push(newApp);
      } else {
        newApp.released = app.released;
        const roundedNumber = Number(app.score?.toFixed(1));
        newApp.ratingsValue = roundedNumber;
        newList.push(newApp);
        const newPosition = {
          _id: path,
          rank: index + 1,
          date: new Date(),
        };
        app.positions = [newPosition];
        app.topIn = {
          _id: path,
          rank: newApp.rank,
          date: new Date(),
        };
        saveNewASApp(app, countryCode);
        newCreated++;
      }
    }
    if (topChart) {
      topChart.list = newList;
      topChart.updated_at = new Date();
      return topChart
        .save()
        .catch((err) =>
          console.error("save topChart on updateTopChart : " + err)
        );
    } else {
      Ios_Top_chart.create({
        _id: path,
        list: newList,
        updated_at: new Date(),
      }).catch((err) =>
        console.error("create new topChart on asUpdateTopChart : " + err)
      );
    }
  });
  console.log(
    " app store: new created: " +
      newCreated +
      " new updated: " +
      newUpdated +
      " " +
      collection.value +
      " " +
      category.value +
      " " +
      country.name
  );
}

async function saveNewGApp(app, countryCode) {
  let type;
  if (app.genreId) {
    if (
      app.genreId.includes("GAME") ||
      app.categories.map((category) => {
        if (category.id?.includes("GAME") || category.name?.includes("Game"))
          return true;
      })
    ) {
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
    histogram: app.histogram,
    price: app.price,
    currency: app.currency,
    free: app.free,
    offersIAP: app.offersIAP,
    IAPRange: app.IAPRange,
    countries: [countryCode],
    topIn: app.topIn,
    androidVersion: app.androidVersion,
    headerImage: app.headerImage,
    privacyPolicy: app.privacyPolicy,
    screenshots: app.screenshots,
    ads: app.adSupported,
    genre: app.genre,
    updated: app.updated,
    type,
    positions: app.positions,
    version: app.version,
    recentChanges: app.recentChanges,
    playstoreUrl: app.url,
    categories: app.categories?.map((category) => category.name),
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
    .catch((err) => {
      if (err.message.includes("E11000 duplicate key")) {
        G_Apps.updateOne(
          { _id: app.appId },
          {
            $push: {
              topChartsTimeLine: {
                $each: [change],
                $position: 0,
              },
              positions: {
                $each: app.positions,
                $position: 0,
              },
            },
          }
        ).catch((err) =>
          console.error("save appDb on updateTopChart : " + err)
        );
      } else {
        console.error("new app failed on save :" + err);
        console.error(JSON.stringify(app));
      }
    });
}

async function saveNewASApp(app, countryCode) {
  
  app.type = (app.genres.find(genre=>genre?.toLowerCase().includes("game")) || app.primaryGenre.toLocaleLowerCase().includes("game")) ? "GAME" : "APP";
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
    topIn: app.topIn,
    currency: app.currency,
    devName: app.developer,
    devId: app.developerId,
    devUrl: app.developerUrl,
    website: app.developerWebsite,
    countries: [countryCode],
    positions: app.positions,
    ratingsValue: app.score?.toFixed(1) || 0,
    currentVersionRatingsValue: app.currentVersionScore?.toFixed(1) || 0,
    currentVersionReviewsCount: app.currentVersionReviews,
    languages: app.languages,
    screenshots: app.screenshots,
    ipadScreenshots: app.ipadScreenshots,
    appletvScreenshots: app.appletvScreenshots,
    AppStoreUrl: app.AppStoreUrl,
    crawled: new Date(),
    published: true,
    updated_at: new Date(),
  }).catch((err) => console.error("new app failed on save :" + err));
}

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
