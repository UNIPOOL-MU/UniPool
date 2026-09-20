# UniPool: keep the shared URL and auto-update a hosting fork

The production link `https://uni-pool-five.vercel.app/` belongs to the **existing Vercel project**. Do not delete that project or recreate its domain.

## One-time setup — the teammate who owns the hosting fork

1. Open your **existing GitHub fork** of `um26/UniPool`. Confirm this is the repository shown under the **existing Vercel project → Settings → Git → Connected Git Repository**, and its Production Branch is `main`. If Vercel is not connected to this fork, connect it within the *same* Vercel project. Do not create a new Vercel project.
2. If your fork has independent commits, preserve and merge them before syncing; do not discard your own work. In the fork's **Sync fork** menu, select **Update branch** to bring over the new workflow at `.github/workflows/sync-upstream-fork.yml`. GitHub may require resolving conflicts first.
3. Open the fork's **Actions** tab and enable workflows if GitHub asks. Open **Sync hosting fork from UniPool** → **Run workflow** once. If it cannot push, check **Settings → Actions → General → Workflow permissions** and grant read/write access to `GITHUB_TOKEN`, subject to your organization policies.
4. Check **Actions** for a successful sync, and compare the latest `main` commit with `um26/UniPool/main`. Make sure the existing Vercel project has automatic Git deployments enabled and that its `main` production branch is connected to this fork. Verify the production deployment at the *same* URL.

## Ongoing behavior

The workflow checks upstream every ten minutes (actual GitHub Actions scheduled start may be delayed). It fast-forwards the fork's `main` only if that is possible without overwriting the teammate's own commits. A fork that diverges fails visibly instead of force-pushing. No personal access token or Vercel secret is needed for the GitHub-to-GitHub step.

Vercel's existing `ignoreCommand` deliberately skips frontend builds when only backend files changed. Render still needs its own deployment integration. Syncing a fork alone **does not** fix a Vercel deployment blocked by account/commit-author permissions; inspect the actual Vercel deployment error if the fork updates but production does not. This repository's GitHub "Vercel" status may refer to an older Vercel project, so verify the hosting teammate's project directly.

This GitHub Action runs only in a fork, never in `um26/UniPool` itself.
