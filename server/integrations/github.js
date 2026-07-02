import { pool } from '../db.js'

export async function getGitHubToken() {
  const row = await pool.query("SELECT value FROM settings WHERE key='github_token'")
  return row.rows[0]?.value || process.env.GITHUB_TOKEN || ''
}

export async function githubFetch(path, token) {
  const tok = token || await getGitHubToken()
  if (!tok) throw new Error('GitHub token not configured')
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `GitHub API error ${res.status}`)
  }
  return res.json()
}

export async function testGitHubConnection() {
  const user = await githubFetch('/user')
  return {
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
    public_repos: user.public_repos,
    html_url: user.html_url
  }
}

export async function fetchGitHubRepos() {
  const repos = []
  let page = 1
  while (true) {
    const batch = await githubFetch(`/user/repos?per_page=100&page=${page}&sort=updated`)
    if (!batch.length) break
    repos.push(...batch)
    if (batch.length < 100) break
    page++
  }
  return repos.map(r => ({
    github_id: r.id,
    name: r.name,
    full_name: r.full_name,
    description: r.description || null,
    language: r.language || null,
    html_url: r.html_url,
    stars: r.stargazers_count,
    forks: r.forks_count,
    open_issues: r.open_issues_count,
    is_private: r.private,
    is_fork: r.fork,
    default_branch: r.default_branch,
    pushed_at: r.pushed_at,
    last_synced: new Date().toISOString()
  }))
}
