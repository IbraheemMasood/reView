# Static preview lifecycle

This ledger tracks the Vercel static viewer preview created by `scripts/deploy-static-demo.ps1` and removed by `scripts/teardown-static-demo.ps1`.

<!-- lifecycle-state:begin -->
{
  "status": "deployed",
  "vercelAccount": "nathanpannell",
  "vercelScope": "nathanpannells-projects",
  "projectName": "review-redesign-demo",
  "projectId": "prj_hkh6ygxPryXl7YH5OlUqT7d74z0q",
  "deploymentId": "dpl_GQ8vUv2ZnqEQWxd4YG11UcgiNqRi",
  "deploymentUrl": "https://review-redesign-demo-r9zzz7jyh-nathanpannells-projects.vercel.app",
  "demoUrl": "https://review-redesign-demo.vercel.app/keychecker/",
  "deploymentTarget": "production",
  "previewDeploymentId": "dpl_CXMvstTah5T8LYhQ2s6s5Nv3FVcs",
  "previewDeploymentUrl": "https://review-redesign-demo-4g3bxgrb6-nathanpannells-projects.vercel.app",
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
    },
    {
      "deploymentId": "dpl_C83D7WsN2ETgbSpsKQkAnRf8GWDK",
      "deploymentUrl": "https://review-redesign-demo-isawwjz0t-nathanpannells-projects.vercel.app",
      "target": "production"
    },
    {
      "deploymentId": "dpl_CXMvstTah5T8LYhQ2s6s5Nv3FVcs",
      "deploymentUrl": "https://review-redesign-demo-4g3bxgrb6-nathanpannells-projects.vercel.app",
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
    "keychecker/index.html": "adcbe7b1ea5df8f3f4ab997be918f63901695c2b5a07e453332c3ed1254fa210",
    "keychecker/app.js": "acb969a380571b200303c935dca30ad8deb5ddf41732404a3c3adcd52ed30956",
    "keychecker/styles.css": "439acedac2a64a621a44bdd5604f79ed29b8db69194395727e137c8b0fa4d76b",
    "keychecker/graph.json": "4b79caed8503bbaf3e2b6e87a4edfd764159d18caaf05f50dea1275fd6b13a29"
  },
  "gitBranch": "codex/remove-inferred-binary-name",
  "gitCommit": "9d698ababc5e5f8097e2be98bdc5d638da0b5d0f",
  "workingTreeDirty": true,
  "createdAtUtc": "2026-10-04T11:02:33.7299478Z",
  "deployedAtUtc": "2026-10-04T12:22:33.1655117Z",
  "lastPublicCheckUtc": "2026-10-04T11:18:35Z",
  "teardownStartedAtUtc": null,
  "teardownCompletedAtUtc": null,
  "lastError": null
}
<!-- lifecycle-state:end -->

The deployment command copies only the three files under `viewer/` and the unchanged keychecker `graph.json` into a temporary staging directory, then generates a root redirect to `/keychecker/`. It creates and uses the standalone Vercel project without connecting a Git repository, promotes the static build to the project's public demo alias, and verifies cache-busted hosted file hashes against the source.

After review, remove the preview with `pwsh -File scripts/teardown-static-demo.ps1 -Apply -ConfirmProjectName <project-name>`.

## Follow-up refinement

The `codex/remove-inferred-binary-name` refinement was committed as `9d698ababc5e5f8097e2be98bdc5d638da0b5d0f` and deployed to the existing project as `dpl_GQ8vUv2ZnqEQWxd4YG11UcgiNqRi` at `https://review-redesign-demo-r9zzz7jyh-nathanpannells-projects.vercel.app`. The public review alias is `https://review-redesign-demo.vercel.app/keychecker/`. Cache-busted checks confirmed the hosted viewer HTML, JavaScript, stylesheet, and unchanged graph JSON match the source and hashes recorded above; the root redirect returns HTTP 200. The deployment used only the three `viewer/` files and unchanged graph JSON. Keep this preview active through the follow-up PR review. Remove it only after review is complete using the teardown command above.
