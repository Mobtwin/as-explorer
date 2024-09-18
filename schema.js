import mongoose, { Schema } from "mongoose";


export const gAppPreviewSchema = new Schema({
  _id: String,
  rank: Number,
  previousRank: Number,
  name: String,
  icon: String,
  installs: Number,
  installsExact: Number,
  dailyInstalls: Number,
  released: Date,
});

export const collectionSchema = new Schema({
  poster: String,
  name: String,
  plan: String,
  description: String,
  filter: String,
  apps: {
    type: [gAppPreviewSchema],
    default: [],
  },
});

const positionSchema = new Schema({
  _id: String,
  rank: Number,
  date: Date,
});

const timeLineEntrySchema = new Schema({
  date: Date,
  field: String,
  before: [String],
  after: [String],
  lang: String,
  country: String,
});

const subPacakgeSchema = new Schema({
  text: String,
  description: String,
  price: Number,
});

const packageSchema = new Schema({
  title: String,
  description: String,
  subs: [subPacakgeSchema],
});

export const developerSchema = new Schema({
  _id: {
    type: String,
  },
  name: {
    type: String,
  },
  accountState: {
    type: Boolean,
    default: true,
  }, // if the account id active or suspended(or removed)
  timeLine: {
    type: [
      {
        date: Date,
        field: String,
        before: String,
        after: String,
      },
    ],
    default: [],
  },
  removed: Date,
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

export const appSchema = new Schema({
  _id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    es_indexed: true,
  },
  summary: {
    type: String,
    required: false,
    es_indexed: true,
  },
  icon: String,
  positions: [positionSchema],
  categories: {
    type: [String],
    default: [],
    required: false,
  },
  installs: {
    type: Number,
    required: false,
  },
  installsExact: Number,
  dailyInstalls: Number,
  ratingsValue: {
    type: Number,
  },
  topIn: {
    type: {
      _id: String,
      rank: Number,
      date: Date
    }
  },
  ratingsCount: {
    type: Number,
  },
  reviewsCount: {
    type: Number,
  },
  histogram: {
    type: { 1: Number, 2: Number, 3: Number, 4: Number, 5: Number },
    default: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  },
  countries: {
    type: [String],
    default: [],
  },
  devId: String,
  devName: {
    type: String,
    required: false,
  },
  devEmail: {
    type: String,
    required: false,
  },
  devAddress: {
    type: String,
    required: false,
  },
  privacyPolicy: String,
  description: {
    type: String,
    required: false,
  },
  comments: [String],
  preregister: Boolean,
  earlyAccessEnabled: Boolean,
  isAvailableInPlayPass: Boolean,
  website: String,
  playstoreUrl: String,
  removed: Date,
  published: {
    type: Boolean,
    default: true,
    required: false,
  },
  crawled: {
    type: Date,
    default: Date.now,
  },
  version: {
    type: String,
    required: false,
  },
  video: String,
  videoImage: String,
  previewVideo: String,
  headerImage: String,
  contentRating: String,
  contentRatingDescription: String,
  size: {
    type: Number,
    required: false,
  },
  updated: {
    type: Date,
    required: false,
  },
  released: Date,
  type: String,
  genre: String,
  country: String,
  free: Boolean,
  recentChanges: String,
  wearos: String,
  price: Number,
  currency: String,
  ads: Boolean,
  offersIAP: Boolean,
  IAPRange: String,
  androidVersion: String,
  devCountry: String,
  similarApps: {
    type: [String],
    default: [],
  },
  screenshots: {
    type: [String],
    default: [],
  },
  collections: {
    type: [String],
    default: [],
  },
  timeLine: {
    type: [timeLineEntrySchema],
    default: [],
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});
appSchema.index({ devName: 1 });
appSchema.index({ name: 1 });
appSchema.index({ summary: 1 });


export const gpTopChartSchema = new Schema({
  _id: String,
  list: [gAppPreviewSchema],
  updated_at: Date,
  created_at: { type: Date, default: Date.now },
});

export const asAppPreviewSchema = new Schema({
  _id: String,
  rank: Number,
  previousRank: Number,
  name: String,
  icon: String,
  categories: [String],
  ratingsCount: Number,
  released: Date,
});

export const asTopChartSchema = new Schema({
  _id: String,
  list: [asAppPreviewSchema],
  updated_at: Date,
  created_at: { type: Date, default: Date.now },
});

export const appStoreSchema = new Schema({
    _id: {
      type: String,
      required: true,
    },
    pkId: String,
    name: String,
    icon: String,
    description: String,
    categories: {
      type: [String],
      default: [],
    },
    primaryCategory: String,
    contentRating: String,
    languages: [String],
    size: Number,
    requiredOsVersion: String,
    released: Date,
    updated: Date,
    recentChanges: String,
    version: String,
    price: Number,
    currency: String,
    free: Boolean,
    type: String,
    topIn: {
      type: {
        _id: String,
        rank: Number,
        date: Date
      }
    },
    countries: {
      type: [String],
      default: [],
    },
    devId: Number,
    devName: String,
    website: String,
    devUrl: String,
    ratingsValue: Number,
    currentVersionRatingsValue: Number,
    currentVersionReviewsCount: Number,
    screenshots: [String],
    ipadScreenshots: [String],
    appletvScreenshots: [String],
    AppStoreUrl: String,
    positions: [positionSchema],
    removed: Date,
    published: {
      type: Boolean,
      default: true,
    },
    crawled: {
      type: Date,
      default: Date.now,
    },
    similarApps: {
      type: [String],
      default: [],
    },
    timeLine: {
      type: [timeLineEntrySchema],
      default: [],
    },
    topChartsTimeLine: {
      type: [timeLineEntrySchema],
      default: [],
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
});

appStoreSchema.index({ devName: 1 });
appStoreSchema.index({ name: 1 });

export const steamGameSchema = new Schema({
  _id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  released: Date,
  required_age: Number,
  price: Number,
  dlc_count: Number,
  description: {
    type: String,
    required: false,
  },
  about_the_game: {
    type: String,
    required: false,
  },
  summary: {
    type: String,
    required: false,
  },
  reviews: String,
  header_image: String,
  website: String,
  support_url: String,
  support_email: String,
  windows: Boolean,
  mac: Boolean,
  linux: Boolean,
  metacritic_score: Number,
  metacritic_url: String,
  achievements: Number,
  recommendations: Number,
  notes: String,
  supported_languages: {
    type: [String],
    default: [],
  },
  full_audio_languages: {
    type: [String],
    default: [],
  },
  packages: {
    type: [packageSchema],
    default: [],
  },
  developers: [String],
  publishers: {
    type: [String],
    default: [],
  },
  categories: {
    type: [String],
    required: false,
  },
  genre: {
    type: String,
  },
  screenshots: {
    type: [String],
    default: [],
  },
  movies: {
    type: [String],
    default: [],
  },
  user_score: Number,
  score_rank: String,
  positive: Number,
  negative: Number,
  estimated_owners: String,
  average_playtime_forever: Number,
  average_playtime_2weeks: Number,
  median_playtime_forever: Number,
  median_playtime_2weeks: Number,
  peak_ccu: Number,
  tags: {
    type: [{
      _id: String,
      count: Number
    }],
    default: []
  },
  published: {
    type: Boolean,
    required: false,
  },
  removed: Date,
  crawled: {
    type: Date,
    default: Date.now,
  },
  updated: {
    type: Date,
    required: false,
  },
  timeLine: {
    type: [timeLineEntrySchema],
    default: [],
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

export const analyticsSchema = new Schema({
  _id: String,
  googlePlayApp: {
    type: {
      updated: Number,
      created: Number,
      removed: Number,
      total: Number,
      createdApps: {
        type: [{
          _id: String,
          name: String,
          icon: String,
          released: Date,
        }],
        default: [],
      },
      removedApps: {
        type: [{
          _id: String,
          name: String,
          icon: String,
          installsExact: Number,
          released: Date,
        }],
        default: [],
      }
    }
  },
  googlePlayDev: {
    type: {
      updated: Number,
      created: Number,
      removed: Number,
      total: Number,
    }
  },
  appStoreApp: {
    type: {
      updated: Number,
      created: Number,
      removed: Number,
      total: Number,
      createdApps: {
        type: [{
          _id: String,
          name: String,
          icon: String,
          released: Date,
        }],
        default: [],
      },
      removedApps: {
        type: [{
          _id: String,
          name: String,
          icon: String,
          currentVersionReviewsCount: Number,
          released: Date,
        }],
        default: [],
      }
    }
  },
  appStoreDev: {
    type: {
      updated: Number,
      created: Number,
      removed: Number,
      total: Number,
    }
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  }
});

const dataSchema = new mongoose.Schema({
  key: String,
  value: String,
  code: String,
});

const map_dataSchema = new mongoose.Schema({
  key: String,
  value: String,
});

export const gAppConstantsSchema = new mongoose.Schema({
  clusters: [dataSchema],
  category: [dataSchema],
  collection: [dataSchema],
  sort: [map_dataSchema],
  age: [map_dataSchema],
  permission: [map_dataSchema],
});

export const appStoreConstantsSchema = new mongoose.Schema({
  collection: [dataSchema],
  category: [dataSchema],
  device: [map_dataSchema],
  sort: [map_dataSchema],
  markets: [map_dataSchema],
});

const featureSchema = new Schema({
  status: Boolean,
  fields: [String],
  filterMatch: Boolean,
  filterRange: Boolean,
  filterTerm: Boolean,
  sort: Boolean,
});

export const authorizationSchema = new Schema({
  _id: String,
  plan: String,
  googlePlay: featureSchema,
  appStore: featureSchema,
  steam: featureSchema
});

const country = new mongoose.Schema({
  name: String,
  code: String,
});

export const constantsSchema = new Schema({
  g_play: gAppConstantsSchema,
  app_store: appStoreConstantsSchema,
  steam: String,
  version: Number,
  countries: [country],
});

const proxySchema = new Schema({
  host: String,
  port: String,
  username: String,
  password: String,
});

const configSchema = new Schema({
  gp_config: {
    top_chart_scanned_today: Boolean,
    top_chart_checkpoint: {
      type: String,
      default: "baaaAl",
    },
    delay: Number,
    new_apps_first: Boolean,
    new_devs_first: Boolean,
    timeline: Boolean,
    scan_apps: Boolean,
    scan_devs: Boolean,
  },
  as_config: {
    top_chart_scanned_today: Boolean,
    top_chart_checkpoint: {
      type: String,
      default: "caaaAl",
    },
    delay: Number,
    new_apps_first: Boolean,
    new_devs_first: Boolean,
    timeline: Boolean,
    scan_apps: Boolean,
    scan_devs: Boolean,
  },
  ipv4proxies: [proxySchema],
  ipv6proxies: [proxySchema],
});

export const G_Apps = mongoose.model("g_apps", appSchema);
export const G_DEVs = mongoose.model("g_developers", developerSchema);
export const G_Collection = mongoose.model("g_collections", collectionSchema);
export const G_TOP_CHART = mongoose.model("g_top_chart", gpTopChartSchema);
export const Ios_Apps = mongoose.model("ios_apps", appStoreSchema);
export const Ios_DEVs = mongoose.model("ios_developers", developerSchema);
export const Ios_Top_chart = mongoose.model("ios_top_chart", asTopChartSchema);
export const Steam_Games = mongoose.model("steam_games", steamGameSchema);
export const Constants = mongoose.model("constants", constantsSchema);
export const Config = mongoose.model("config", configSchema);
