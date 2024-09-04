import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = path.join(__dirname, "./../app.yml");

// Load the YAML config
let config;
try {
  const fileContents = fs.readFileSync(configPath, "utf8");
  config = yaml.load(fileContents);
} catch (e) {
  console.error("Error loading YAML config:", e);
}

const {
  gif_limit: gifLimit,
  gif_randomised: gifRandomised,
  gif_width: gifWidth,
  gif_height: gifHeight,
} = config.bot.gif_settings;

const keySearchTerms = [
  {
    key: ["merge conflict", "conflict", "cannot merge"],
    term: ["frustration", "confusion", "resolution"],
  },
  {
    key: ["pull failed", "cannot pull", "fetch error"],
    term: ["connection issue", "retry", "frustration"],
  },
  {
    key: ["pull request", "new pull request"],
    term: ["army incoming", "new call"],
  },
  {
    key: ["pull request reopened"],
    term: ["old pain", "migrane"],
  },
  {
    key: ["issue reopened"],
    term: ["self slap", "bad days"],
  },
  {
    key: ["dependency conflict", "cannot install", "package error"],
    term: ["puzzled", "not fitting"],
  },
  {
    key: ["new discussion", "discussion created"],
    term: ["people chatting", "looking for answer"],
  },
  {
    key: ["discussion answered", "new discussion comment"],
    term: ["got it", "wondering"],
  },
  {
    key: ["discussion closed"],
    term: ["end of discussion"],
  },
  {
    key: ["code style", "lint error", "style guide"],
    term: ["cleaning up", "making adjustment", "fixing"],
  },
  {
    key: ["branch out of date", "needs rebasing", "update required"],
    term: ["rewinding", "updating", "catching up"],
  },
  {
    key: ["permission denied", "access error", "cannot push"],
    term: ["locked door", "blocked path", "denied access"],
  },
  {
    key: ["file too large", "exceeds limit", "cannot upload"],
    term: ["struggling", "heavy lifting", "oversized"],
  },
  {
    key: ["network error", "connection failed", "timeout"],
    term: ["signal lost", "buffering", "connectivity issue"],
  },
  {
    key: ["invalid command", "syntax error", "command not found"],
    term: ["confusion", "wrong turn", "mistake"],
  },
  {
    key: ["revert failed", "cannot revert", "undo changes"],
    term: ["time rewind", "undo action", "reversing"],
  },
  {
    key: ["out of sync", "sync error", "update needed"],
    term: ["synchronizing", "catching up"],
  },
  {
    key: ["file not found", "404", "missing file"],
    term: ["searching", "looking around", "404"],
  },
  {
    key: ["env error", "configuration failed", "setup issue"],
    term: ["error in setting", "broken gear"],
  },
  {
    key: ["merged", "merge successful", "successfully merged"],
    term: ["celebration", "high fives"],
  },
  {
    key: ["approved", "reviewed", "pull request approved"],
    term: ["thumbs up", "clapping", "nodding in approval"],
  },
  {
    key: ["deployed", "deployment successful", "successfully deployed"],
    term: ["fireworks", "launch success", "mission accomplished"],
  },
  {
    key: ["fixed", "solved", "issue resolved"],
    term: ["peace restored", "problem solved"],
  },
  {
    key: ["new problem", "new issue", "issue opened"],
    term: ["face palm", "sad life"],
  },
  {
    key: ["branch updated", "branch synced", "branch rebased"],
    term: ["smooth", "keep up"],
  },
];

async function getGifs(term) {
  const url = "https://tenor.googleapis.com/v2/search";
  try {
    const response = await axios.get(url, {
      params: {
        q: encodeURIComponent(term),
        key: process.env.API_KEY,
        client_key: process.env.CLIENT_KEY,
        limit: gifLimit,
      },
    });
    const gifUrls = response.data.results;
    if (gifUrls.length > 0) {
      const topGifs =
        gifUrls[0]["media_formats"]["mediumgif"].url || "No GIF found.";
      return topGifs;
    }
  } catch (error) {
    console.error("Error fetching gif:", error);
    return "Error fetching gif";
  }
}

export {
  gifWidth,
  gifHeight,
  gifLimit,
  gifRandomised,
  getGifs,
  keySearchTerms,
};
