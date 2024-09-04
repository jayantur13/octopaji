import express from "express";
import { createHmac } from "crypto";
import { Octokit } from "@octokit/rest";
import { gifHeight, gifWidth, getGifs, keySearchTerms } from "./utils/api.js";
import jwt from "jsonwebtoken";
import { createAppAuth } from "@octokit/auth-app";
// Load dotenv at the top of your file
import dotenv from "dotenv";

// Configure dotenv
dotenv.config();

// Define keywords with proper regex patterns
const keywords = [
  { keyword: /bug/i, label: "bug" },
  { keyword: /error/i, label: "error" },
  { keyword: /fail/i, label: "failure" },
  { keyword: /crash/i, label: "crash" },
  { keyword: /feature/i, label: "enhancement" },
  { keyword: /improve/i, label: "enhancement" },
  { keyword: /refactor/i, label: "enhancement" },
  { keyword: /first issue/i, label: "good first issue" },
  { keyword: /beginner/i, label: "good first issue" },
];

const installationStore = new Map(); // Simple in-memory store

// Read the private key from the env
const privateKey = process.env.PKEY.replace(/\\n/g, '\n');
const appId = process.env.APP_ID; // Replace with your GitHub App ID

let jwtToken = generateJWT(appId, privateKey);
let tokenExpiration = Date.now() + 10 * 60 * 1000; // Set expiration time

// Generate the JWT
function generateJWT(appId, privateKey) {
  const payload = {
    iat: Math.floor(Date.now() / 1000) - 60, // Issued 1 minute ago
    exp: Math.floor(Date.now() / 1000) + 10 * 60, // Expires in 10 minutes
    iss: appId,
  };

  return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

// Function to renew JWT if needed
function renewJWTIfNeeded() {
  const currentTime = Date.now();

  // Check if the token is expired or will expire in the next 30 seconds
  if (currentTime >= tokenExpiration - 30000) {
    console.log("Renewing JWT...");
    jwtToken = generateJWT(appId, privateKey);
    tokenExpiration = currentTime + 10 * 60 * 1000;
    console.log("JWT renewed successfully");
  }
}

// Create an instance of Octokit
function createOctokitInstance(installationId) {
  renewJWTIfNeeded(); // Renew JWT before creating Octokit instance if needed

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: appId,
      privateKey: privateKey,
      installationId: installationId,
    },
  });
}

function storeInstallation(installationId, repoData) {
  installationStore.set(installationId, repoData);
}

function getRepoData(installationId) {
  return installationStore.get(installationId);
}

async function handleInstallationEvent(payload) {
  const installationId = payload.installation.id;
  console.log(`Handling installation event for ID: ${installationId}`);

  if (payload.action === "deleted") {
    await cleanupInstallationData(installationId);
    console.log(
      `Installation ${installationId} has been deleted. Cleaned up resources.`
    );
  } else if (payload.action === "suspend") {
    await suspendInstallation(installationId);
    console.log(`Installation ${installationId} has been suspended.`);
  } else if (payload.action === "unsuspend") {
    await unsuspendInstallation(installationId);
    console.log(`Installation ${installationId} has been unsuspended.`);
  } else {
    try {
      // Create an Octokit instance with the installation ID
      const octokit = createOctokitInstance(installationId);

      // List repositories accessible to this installation
      const { data } =
        await octokit.rest.apps.listReposAccessibleToInstallation();
      const repos = data.repositories;
      storeInstallation(installationId, repos);
    } catch (error) {
      console.error(`Failed to handle installation event: ${error.message}`);
      if (error.response) {
        console.error(`GitHub API response: ${error.response.data.message}`);
      }
    }
  }
}

const app = express();
app.use(express.json());
app.use(express.static("./")); //For the website

app.get("/", (req, res) => {
  return res.sendFile("index.html");
});

app.get("/privacy-policy", (req, res) => {
  return res.sendFile("privacy-policy.html");
});

// Verify the webhook signature
function verifySignature(req, res, buf) {
  const signature = `sha256=${createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(buf)
    .digest("hex")}`;
  if (req.headers["x-hub-signature-256"] !== signature) {
    throw new Error("Invalid signature");
  }
}

// Endpoint to handle webhook events
app.post(
  "/webhook",
  express.json({ verify: verifySignature }),
  async (req, res) => {
    const event = req.headers["x-github-event"];
    console.log(`Received event: ${event}`);
    const payload = req.body;
    const installationId = payload.installation && payload.installation.id;

    if (!installationId) {
      console.error("Installation ID is missing from the payload.");
      res.status(400).send("Installation ID is missing");
      return;
    }

    console.log("Installation ID:", installationId);

    switch (event) {
      case "installation":
      case "installation_repositories":
        await handleInstallationEvent(payload);
        storeInstallation(payload.installation.id, payload.repositories);
        break;
      case "pull_request":
        await handlePullRequestEvent(payload);
        break;
      case "push":
        await handlePushEvent(payload);
        break;
      case "issues":
        await handleIssueEvent(payload);
        break;
      case "issue_comment":
        await handleIssueCommentEvent(payload);
        break;
      case "deployment_status":
        await handleDeploymentEvent(payload);
        break;
      case "check_run":
      case "check_suite":
        await handleCheckRunEvent(payload);
        break;
      case "discussion":
        await handleDiscussionEvent(payload);
        break;
      case "discussion_comment":
        await handleDiscussionCommentEvent(payload);
        break;
      // More cases here as needed
    }

    res.status(200).send("Webhook received");
  }
);

// Function to clean up installation data
async function cleanupInstallationData(installationId) {
  // Delete or archive data related to the installation from database
  // Remove any associated webhooks or resources

  // Remove the installation from your Map
  if (installationStore.has(installationId)) {
    installationStore.delete(installationId);
    console.log(`Removed installation ID ${installationId} from the Map.`);
  }
}

// Function to handle suspension
async function suspendInstallation(installationId) {
  // Pause jobs or operations related to this installation

  // Mark the installation as suspended in your Map
  if (installationStore.has(installationId)) {
    installationStore.set(installationId, {
      ...installationStore.get(installationId),
      suspended: true,
    });
    console.log(`Marked installation ID ${installationId} as suspended.`);
  }
}

// Function to handle unsuspension
async function unsuspendInstallation(installationId) {
  // Resume jobs or operations related to this installation

  // Re-enable the installation in your Map
  if (installationStore.has(installationId)) {
    installationStore.set(installationId, {
      ...installationStore.get(installationId),
      suspended: false,
    });
    console.log(`Re-enabled installation ID ${installationId}.`);
  }
}

async function handlePullRequestEvent(payload) {
  const action = payload.action;
  const merged = payload.pull_request.merged;
  const mergeable_state = payload.pull_request.mergeable_state;

  if (action === "opened") {
    await handleEvent("pull request", payload);
  } else if (action === "reopened") {
    await handleEvent("pull request reopened", payload);
  } else if (action === "closed" && merged) {
    await handleEvent("merge successful", payload);
  } else if (mergeable_state === "dirty") {
    await handleEvent("merge conflict", payload);
  } else if (action === "approved") {
    await handleEvent("approved", payload);
  }
}

async function handleBranchUpdated(payload, gifs) {
  if (payload.ref) {
    const branchName = payload.ref.split("/").pop();
    const comment = generateComment(
      `The branch **${branchName}** has been updated.`,
      gifs
    );
    await postComment(payload, comment);
  } else {
    console.error("The 'ref' field is undefined in the payload.");
    const comment = generateComment(
      `😵 Oops! Something went wrong, the branch information couldn't be retrieved.`,
      gifs
    );
    await postComment(payload, comment);
  }
}

async function handlePushEvent(payload) {
  if (payload.ref) {
    const branch = payload.ref.split("/").pop();

    if (branch.includes("main") || branch.includes("master")) {
      await handleEvent("branch updated", payload);
    } else {
      if (payload.forced) {
        await handleEvent("force push detected", payload);
      }
      if (branch.startsWith("feature/")) {
        await handleEvent("feature branch updated", payload);
      } else if (branch.startsWith("hotfix/")) {
        await handleEvent("hotfix branch updated", payload);
      }
    }
  }
}

async function handleNewIssue(payload, gifs) {
  const currentIssue = payload.issue;
  const similarIssues = await searchSimilarIssues(payload);

  const keywords = [
    { keyword: "bug", label: "bug" },
    { keyword: "error", label: "error" },
    { keyword: "fail", label: "failure" },
    { keyword: "crash", label: "crash" },
    { keyword: "feature", label: "enhancement" },
    { keyword: "improve", label: "enhancement" },
    { keyword: "refactor", label: "enhancement" },
    { keyword: "first issue", label: "good first issue" },
    { keyword: "beginner", label: "good first issue" },
  ];

  const lowerTitle = currentIssue.title.toLowerCase();
  const lowerBody = (currentIssue.body || "").toLowerCase();

  const foundKeyword = keywords.find((keywordObj) => {
    const keyword = keywordObj.keyword.toLowerCase();
    return lowerTitle.includes(keyword) || lowerBody.includes(keyword);
  });

  let similarIssuesCommented = false;

  if (similarIssues && similarIssues.length > 0) {
    const comment = `👉🏻 Similar issues found, please check: <br/> - ${similarIssues}`;
    await postComment(payload, comment);
    similarIssuesCommented = true;
  }

  if (foundKeyword) {
    await autoLabelAndAssign(payload, foundKeyword.label);

    if (!similarIssuesCommented) {
      const comment = generateComment(
        `😵 Oh no! A new issue spotted. Thank you for your contribution!`,
        gifs
      );
      await postComment(payload, comment);
    }
  } else if (!similarIssuesCommented) {
    const comment = generateComment(
      `😵 Oh no! A new issue spotted. Thank you for your contribution!`,
      gifs
    );
    await postComment(payload, comment);
    await autoLabelAndAssign(payload, null);
  }
}

async function handleNewPR(payload, gifs) {
  const currentPR = payload.pull_request;
  const similarPRs = await searchSimilarPRs(payload);

  const keywords = [
    { keyword: "bug", label: "bug" },
    { keyword: "error", label: "error" },
    { keyword: "fail", label: "failure" },
    { keyword: "crash", label: "crash" },
    { keyword: "feature", label: "enhancement" },
    { keyword: "improve", label: "enhancement" },
    { keyword: "refactor", label: "enhancement" },
    { keyword: "first issue", label: "good first issue" },
    { keyword: "beginner", label: "good first issue" },
  ];

  const lowerTitle = currentPR.title.toLowerCase();
  const lowerBody = (currentPR.body || "").toLowerCase();

  const foundKeyword = keywords.find((keywordObj) => {
    const keyword = keywordObj.keyword.toLowerCase();
    return lowerTitle.includes(keyword) || lowerBody.includes(keyword);
  });

  let similarPRsCommented = false;

  if (similarPRs && similarPRs.length > 0) {
    const comment = `👉🏻 Similar PRs found, please check: <br/> - ${similarPRs}`;
    await postComment(payload, comment);
    similarPRsCommented = true;
  }

  if (foundKeyword) {
    await autoLabelAndAssign(payload, foundKeyword.label);

    if (!similarPRsCommented) {
      const comment = generateComment(
        `😵 Oh no! A new PR spotted. Thank you for your contribution!`,
        gifs
      );
      await postComment(payload, comment);
    }
  } else if (!similarPRsCommented) {
    const comment = generateComment(
      `😵 Oh no! A new PR spotted. Thank you for your contribution!`,
      gifs
    );
    await postComment(payload, comment);
    await autoLabelAndAssign(payload, null);
  }
}

async function handleIssueEvent(payload) {
  const action = payload.action;
  if (action === "opened") {
    await handleEvent("issue opened", payload);
  } else if (action === "edited") {
  } else if (action === "deleted") {
  } else if (action === "transferred") {
  } else if (action === "pinned") {
  } else if (action === "unpinned") {
  } else if (action === "reopened") {
    await handleEvent("reopened issue", payload);
  } else if (action === "closed") {
    await handleEvent("issue resolved", payload);
  } else if (action === "assigned") {
  } else if (action === "unassigned") {
  } else if (action === "labeled") {
  } else if (action === "unlabeled") {
  } else if (action === "locked") {
  } else if (action === "unlocked") {
  } else if (action === "milestoned") {
  } else if (action === "demilestoned") {
  }
}

async function handleDeploymentEvent(payload) {
  const status = payload.deployment_status.state;
  if (status === "success") {
    await handleEvent("deployed", payload);
  } else {
    if (status === "failure" || status === "error") {
      await handleEvent("deployment failed", payload);
    }
    if (status === "cancelled" || status === "canceled") {
      await handleEvent("deployment canceled", payload);
    }
    if (status === "timed_out") {
      await handleEvent("deployment timed out", payload);
    } else {
      await handleEvent("deployment unknown status", payload);
      console.log(`Unhandled deployment status: ${status}`);
    }
  }
}

async function handleCheckRunEvent(payload) {
  // Log the payload for debugging purposes
  console.log(
    "Received check_run event payload:",
    JSON.stringify(payload, null, 2)
  );

  // Check if check_run exists
  if (payload.check_run) {
    const conclusion = payload.check_run.conclusion;
    const name = payload.check_run.name || ""; // Default to empty string if undefined

    if (conclusion) {
      if (conclusion === "success") {
        if (name.toLowerCase().includes("lint")) {
          await handleEvent("code style", payload);
        } else if (name.toLowerCase().includes("deploy")) {
          await handleEvent("deployed", payload);
        }
      } else if (conclusion === "failure") {
        await handleEvent("code style", payload);
      }
    } else {
      console.warn(
        "check_run.conclusion is undefined. Skipping event processing."
      );
    }
  } else {
    console.error(
      "check_run is undefined in the payload. Cannot process event."
    );
  }
}

//A comment on issue is created,edited or deleted
async function handleIssueCommentEvent(payload) {
  const action = payload.action;
  const commentBody = payload.comment ? payload.comment.body : null;

  // Respond only to newly created comments
  if (commentBody && action === "created") {
    // Example logic: If the comment contains "fix", trigger "issue resolved"
    if (commentBody.toLowerCase().includes("fix")) {
      await handleEvent("issue resolved", payload);
    }
    // Example logic: If the comment contains "deploy", trigger "deployed"
    if (commentBody.toLowerCase().includes("deploy")) {
      await handleEvent("deployed", payload);
    } else if (action === "edited") {
    } else if (action === "deleted") {
    }
  }
}

//Actually getting gif from this function
async function getGifRes(randomTerm) {
  return await getGifs(randomTerm);
}

//For all the cases described in permissions
async function handleEvent(searchKey, payload) {
  let comment;
  for (const entry of keySearchTerms) {
    // Check if the search key exists in the current entry's key array
    if (entry.key.includes(searchKey)) {
      // Get a random term from the term array
      const randomTerm =
        entry.term[Math.floor(Math.random() * entry.term.length)];

      const gifs = await getGifRes(randomTerm);
      switch (searchKey) {
        case "pull request":
          await handleNewPR(payload, gifs);
          break;
        case "merge successful":
          comment = `👌 The PR is merged.<br/><img src="${gifs}" width="${gifWidth}" alt="tenorGif" height="${gifHeight}"/>
          > [Via Tenor](https://tenor.com/)`;
          await postComment(payload, comment);
          break;
        case "merge conflict":
          comment = `⚔️ Merge Conflict,resolve it.<br/><img src="${gifs}" width="${gifWidth}" alt="tenorGif" height="${gifHeight}"/>
          > [Via Tenor](https://tenor.com/)`;
          await postComment(payload, comment);
          break;
        case "approved":
          comment = `👍 Approved by admin/maintainer.</br><img src="${gifs}" width="${gifWidth}" alt="tenorGif" height="${gifHeight}"/>
          > [Via Tenor](https://tenor.com/)`;
          await postComment(payload, comment);
          break;
        case "issue resolved":
          comment = `🎉🥳 Looks like issue resolved, feel free to reopen, if not.<br/><img src="${gifs}" width="${gifWidth}" alt="tenorGif" height="${gifHeight}"/>
          > [Via Tenor](https://tenor.com/)`;
          await postComment(payload, comment);
          break;
        case "issue opened":
          await handleNewIssue(payload, gifs);
          break;
        case "branch updated":
          await handleBranchUpdated(payload, gifs);
          break;
        case "deployed":
          comment = `🚀 Deployment successful, hooray!<br/><img src="${gifs}" width="${gifWidth}" alt="tenorGif" height="${gifHeight}"/>
          > [Via Tenor](https://tenor.com/)`;
          await postComment(payload, comment);
          break;
        case "deployment canceled":
          comment = `❌ Deployment was canceled.<br/><img src="${gifs}" width="${gifWidth}" alt="tenorGif" height="${gifHeight}"/>
          > [Via Tenor](https://tenor.com/)`;
          await postComment(payload, comment);
          break;
        case "code style":
          comment = `🔍 Code style issues detected.<br/><img src="${gifs}" width="${gifWidth}" alt="tenorGif" height="${gifHeight}"/><br/>> Please review the guidelines and make necessary adjustments.
          > [Via Tenor](https://tenor.com/)`;
          await postComment(payload, comment);
          break;
      }
    }
  }
}

// Function to search for similar issues
async function searchSimilarIssues(payload) {
  try {
    const installationId = payload.installation.id;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const currentIssueNumber = payload.issue.number;
    const searchTerm = payload.issue.title;

    const octokit = createOctokitInstance(installationId);
    const searchResponse = await octokit.search.issuesAndPullRequests({
      q: `${searchTerm} repo:${owner}/${repo} is:issue`,
      per_page: 5,
    });

    if (searchResponse.data.items.length > 0) {
      // Filter out the current issue from the search results
      const filteredIssues = searchResponse.data.items.filter(
        (issue) => issue.number !== currentIssueNumber
      );

      return filteredIssues
        .map((issue) => `#${issue.number} - ${issue.title}`)
        .join("<br/>");
    } else {
      return [];
    }
  } catch (error) {
    console.error("Error searching for similar issues:", error);
    return null;
  }
}

// Function to search for similar pull requests
async function searchSimilarPRs(payload) {
  try {
    const installationId = payload.installation.id;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const currentPRNumber = payload.pull_request.number;
    const searchTerm = payload.pull_request.title;

    const octokit = createOctokitInstance(installationId);
    const searchResponse = await octokit.search.issuesAndPullRequests({
      q: `${searchTerm} repo:${owner}/${repo} is:pr`,
      per_page: 5,
    });

    if (searchResponse.data.items.length > 0) {
      // Filter out the current PR from the search results
      const filteredPRs = searchResponse.data.items.filter(
        (pr) => pr.number !== currentPRNumber
      );

      return filteredPRs
        .map((pr) => `#${pr.number} - ${pr.title}`)
        .join("<br/>");
    } else {
      return [];
    }
  } catch (error) {
    console.error("Error searching for similar pull requests:", error);
    return null;
  }
}

async function postComment(payload, comment) {
  try {
    const installationId = payload.installation && payload.installation.id;
    if (!installationId) {
      console.error("Installation ID is missing from the payload.");
      return;
    }

    const repoOwner = payload.repository.owner.login;
    const repoName = payload.repository.name;
    let issueNumber = null;

    const octokit = createOctokitInstance(installationId);

    if (payload.issue) {
      issueNumber = payload.issue.number;
      await octokit.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: issueNumber,
        body: comment,
      });
      console.log(
        `Comment posted to issue #${issueNumber} in ${repoOwner}/${repoName}`
      );
    } else if (payload.pull_request) {
      issueNumber = payload.pull_request.number;
      await octokit.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: issueNumber,
        body: comment,
      });
      console.log(
        `Comment posted to pull request #${issueNumber} in ${repoOwner}/${repoName}`
      );
    } else {
      console.error("Issue or pull request number is missing.");
    }
  } catch (error) {
    console.error(`Failed to post comment: ${error.message}`);
    if (error.response) {
      console.error(`GitHub API response: ${error.response.data.message}`);
    }
  }
}

async function autoLabelAndAssign(payload) {
  const installationId = payload.installation.id;
  const octokit = createOctokitInstance(installationId);
  const title = payload.issue?.title || "";
  const body = payload.issue?.body || "";
  const number = payload.issue?.number; // Ensure issue number exists
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;

  // Track labels to apply
  const labelsToApply = new Set();

  // Check if any keyword exists in title or body and add corresponding label
  for (const { keyword, label } of keywords) {
    if (keyword.test(title) || keyword.test(body)) {
      labelsToApply.add(label);
    }
  }

  if (labelsToApply.size > 0) {
    // Apply the labels
    await octokit.issues.addLabels({
      owner: owner,
      repo: repo,
      issue_number: number,
      labels: Array.from(labelsToApply),
    });

    // Assign the issue to a maintainer
    const maintainer = await getCurrentMaintainer(owner, repo, installationId);
    if (maintainer) {
      await octokit.issues.addAssignees({
        owner: owner,
        repo: repo,
        issue_number: number,
        assignees: [maintainer],
      });
    }
  }
}

async function getCurrentMaintainer(owner, repo, installationId) {
  try {
    // Get list of collaborators
    const octokit = createOctokitInstance(installationId);
    const collaborators = await octokit.repos.listCollaborators({
      owner,
      repo,
    });

    // Filter by permission and return the first maintainer found
    const maintainer = collaborators.data.find(
      (collab) => collab.permissions.admin || collab.permissions.push
    );

    return maintainer ? maintainer.login : null;
  } catch (error) {
    console.error("Error fetching maintainer:", error);
    return null;
  }
}

function generateComment(text, gifUrl) {
  return `${text}<br/><img src="${gifUrl}" width="${gifWidth}" alt="tenorGif" height="${gifHeight}"/><br/> > [Via Tenor](https://tenor.com/)`;
}

setInterval(renewJWTIfNeeded, 60 * 1000); // Check JWT every minute

// Start the Express server
app.listen(process.env.PORT, () => {
  console.log("Server is running on port 3000");
});
