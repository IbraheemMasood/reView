# Static preview lifecycle

This ledger tracks the Vercel static viewer preview created by `scripts/deploy-static-demo.ps1` and removed by `scripts/teardown-static-demo.ps1`.

<!-- lifecycle-state:begin -->
{
  "status": "deployed",
  "vercelAccount": "nathanpannell",
  "vercelScope": "nathanpannells-projects",
  "projectName": "review-redesign-demo",
  "projectId": "prj_hkh6ygxPryXl7YH5OlUqT7d74z0q",
  "deploymentId": "dpl_C83D7WsN2ETgbSpsKQkAnRf8GWDK",
  "deploymentUrl": "https://review-redesign-demo-isawwjz0t-nathanpannells-projects.vercel.app",
  "demoUrl": "https://review-redesign-demo.vercel.app/keychecker/",
  "deploymentTarget": "production",
  "previewDeploymentId": "dpl_BMNgiJ7uegAGSadyS7eB2AckgVim",
  "previewDeploymentUrl": "https://review-redesign-demo-avucm22o8-nathanpannells-projects.vercel.app",
  "previousDeployments": [
    {
      "deploymentId": "dpl_8zh3HLdwSdUAoPSPMXvs1CEE1nBe",
      "deploymentUrl": "https://review-redesign-demo-bgcfg8wko-nathanpannells-projects.vercel.app",
      "target": "production"
    },
    {
      "deploymentId": "dpl_HGRY1x1kzAiz3iH6KtR5t2LMJX9v",
      "deploymentUrl": "https://review-redesign-demo-71bq5g0g3-nathanpannells-projects.vercel.app",
      "target": "preview"
    },
    {
      "deploymentId": "dpl_HfC9xB6Mpg9Cu1ku3kqwSvFL565w",
      "deploymentUrl": "https://review-redesign-demo-prxl6nifm-nathanpannells-projects.vercel.app",
      "target": "production"
    },
    {
      "deploymentId": "dpl_FCuX57vFyivBhLRPZDr5aHoeYqmS",
      "deploymentUrl": "https://review-redesign-demo-9tko4r8s1-nathanpannells-projects.vercel.app",
      "target": "preview"
    },
    {
      "deploymentId": "dpl_9YB3MoKexy8GdoPBB2DAdTzwGiv4",
      "deploymentUrl": "https://review-redesign-demo-h4gvqpeyq-nathanpannells-projects.vercel.app",
      "target": "production"
    },
    {
      "deploymentId": "dpl_27TEDWK7wSovgFrKkTqBr22RPxiT",
      "deploymentUrl": "https://review-redesign-demo-n2qqq68mh-nathanpannells-projects.vercel.app",
      "target": "preview"
    },
    {
      "deploymentId": "dpl_2DN688ZLEkpW27boSd141uuPw48L",
      "deploymentUrl": "https://review-redesign-demo-mzhexeyuj-nathanpannells-projects.vercel.app",
      "target": "production"
    },
    {
      "deploymentId": "dpl_BMNgiJ7uegAGSadyS7eB2AckgVim",
      "deploymentUrl": "https://review-redesign-demo-avucm22o8-nathanpannells-projects.vercel.app",
      "target": "preview"
    }
  ],
  "payloadFiles": [
    "index.html",
    "keychecker/app.js",
    "keychecker/graph.json",
    "keychecker/index.html",
    "keychecker/styles.css"
  ],
  "payloadHashes": {
    "keychecker/index.html": "9da81c176ffdb6fd7f768e4e15b9178b842e676ac9abd44d3475d6432d64c9d6",
    "keychecker/app.js": "2c688230edfbefe562695c1977aa56035a825a9f918b7d06f6c89778e9e02259",
    "keychecker/styles.css": "61ccd7551bbb46391886b89836139053f0c4f69518a5ae02fd4b2f458967d6d3",
    "keychecker/graph.json": "4b79caed8503bbaf3e2b6e87a4edfd764159d18caaf05f50dea1275fd6b13a29"
  },
  "gitBranch": "codex/ui-control-refinement",
  "gitCommit": "92b2dad289e3486ab08a10fec8ff0d1f2d05bf22",
  "workingTreeDirty": true,
  "createdAtUtc": "2026-10-04T11:02:33.7299478Z",
  "deployedAtUtc": "2026-10-04T12:03:06.7165916Z",
  "lastPublicCheckUtc": "2026-10-04T11:18:35Z",
  "teardownStartedAtUtc": null,
  "teardownCompletedAtUtc": null,
  "lastError": null
}
<!-- lifecycle-state:end -->

The deployment command copies only the three files under `viewer/` and the unchanged keychecker `graph.json` into a temporary staging directory, then generates a root redirect to `/keychecker/`. It creates and uses the standalone Vercel project without connecting a Git repository, promotes the static build to the project's public demo alias, and verifies cache-busted hosted file hashes against the source.

After review, remove the preview with `pwsh -File scripts/teardown-static-demo.ps1 -Apply -ConfirmProjectName <project-name>`.

## Follow-up refinement

The `codex/ui-control-refinement` follow-up is in progress as of 2026-10-04 11:49 UTC. At the read-only pre-push audit, the checkout was at `c466f1467a068f8a119751f51f19352c576e911e` and tracked `origin/master`; the feature branch has not been pushed by this preview owner. The live upstream GitHub Actions inventory was empty, the local checkout had no `.github/workflows`, and the existing Vercel project still had no Git integration. GitHub CLI and Vercel CLI were available and authenticated as `NathanPannell` and `nathanpannell`, respectively. The existing public demo alias remains assigned to this owned Vercel project for follow-up PR review. Deploy the updated allowlisted viewer files only after the parent confirms source freeze, then update this lifecycle record with the follow-up branch, exact source revision, deployment ID, and verified asset hashes.
