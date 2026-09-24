import { readFile, writeFile } from "node:fs/promises";

const USERNAME = "L-at-nnes";
const MAX_COMMITS = 5;
const START = "<!-- recent_commits starts -->";
const END = "<!-- recent_commits ends -->";

function authHeaders() {
  const headers = {
    "User-Agent": USERNAME,
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub API error for ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchRecentPushes() {
  const pushes = [];
  for (let page = 1; page <= 10 && pushes.length < MAX_COMMITS; page++) {
    const events = await fetchJson(
      `https://api.github.com/users/${USERNAME}/events/public?per_page=100&page=${page}`
    );
    if (events.length === 0) break;
    pushes.push(...events.filter((event) => event.type === "PushEvent"));
  }
  return pushes.slice(0, MAX_COMMITS);
}

async function main() {
  const pushes = await fetchRecentPushes();

  const commits = await Promise.all(
    pushes.map(async (event) => {
      const repo = event.repo.name;
      const sha = event.payload.head;
      const commit = await fetchJson(`https://api.github.com/repos/${repo}/commits/${sha}`);
      return {
        repo,
        message: commit.commit.message.split("\n")[0].trim(),
        sha,
        date: event.created_at.slice(0, 10),
      };
    })
  );

  const rows = commits.map(({ repo, message, sha, date }) => {
    const shortMessage = message.length > 60 ? `${message.slice(0, 57)}...` : message;
    const commitUrl = `https://github.com/${repo}/commit/${sha}`;
    return `| [${repo}](https://github.com/${repo}) | [${shortMessage.replace(/\|/g, "\\|")}](${commitUrl}) | ${date} |`;
  });

  const body = rows.length
    ? ["| Repo | Commit | Date |", "|---|---|---|", ...rows].join("\n")
    : "_No recent public activity._";
  const table = ["<div align=\"center\">", "", body, "", "</div>"].join("\n");

  const readmePath = new URL("../README.md", import.meta.url);
  const readme = await readFile(readmePath, "utf8");

  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("Markers not found in README.md");
  }

  const updated =
    readme.slice(0, startIdx + START.length) +
    "\n" + table + "\n" +
    readme.slice(endIdx);

  if (updated !== readme) {
    await writeFile(readmePath, updated, "utf8");
    console.log(`Updated README.md with ${rows.length} recent commit(s).`);
  } else {
    console.log("README.md already up to date.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
