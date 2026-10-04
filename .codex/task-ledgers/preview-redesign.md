# Static preview lifecycle

This ledger tracks the Vercel static viewer preview created by `scripts/deploy-static-demo.ps1` and removed by `scripts/teardown-static-demo.ps1`.

<!-- lifecycle-state:begin -->
{
  "status": "deployed",
  "vercelAccount": "nathanpannell",
  "vercelScope": "nathanpannells-projects",
  "projectName": "review-redesign-demo",
  "projectId": "prj_hkh6ygxPryXl7YH5OlUqT7d74z0q",
  "deploymentId": "dpl_9YB3MoKexy8GdoPBB2DAdTzwGiv4",
  "deploymentUrl": "https://review-redesign-demo-h4gvqpeyq-nathanpannells-projects.vercel.app",
  "demoUrl": "https://review-redesign-demo.vercel.app/keychecker/",
  "deploymentTarget": "production",
  "previewDeploymentId": "dpl_FCuX57vFyivBhLRPZDr5aHoeYqmS",
  "previewDeploymentUrl": "https://review-redesign-demo-9tko4r8s1-nathanpannells-projects.vercel.app",
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
    "keychecker/index.html": "4e88829a4d455f890daf3e723029f6414b02aa9fc62b2dbf31882d506640227c",
    "keychecker/app.js": "f2384fe3bb6d5344ecf2f5c16b3d8c0ed3d72e5a763ac01294933526e22a4ce5",
    "keychecker/styles.css": "eebc33157a91cdfb861d6fb21e075858f152e525e92a0063128c3ca1803b44ac",
    "keychecker/graph.json": "4b79caed8503bbaf3e2b6e87a4edfd764159d18caaf05f50dea1275fd6b13a29"
  },
  "gitBranch": "codex-redesign",
  "gitCommit": "184abe2cdb11d33ec2ca814089e9d37a1cff3ab1",
  "workingTreeDirty": true,
  "createdAtUtc": "2026-10-04T11:02:33.7299478Z",
  "deployedAtUtc": "2026-10-04T11:18:35Z",
  "lastPublicCheckUtc": "2026-10-04T11:18:35Z",
  "teardownStartedAtUtc": null,
  "teardownCompletedAtUtc": null,
  "lastError": null
}
<!-- lifecycle-state:end -->

The deployment command copies only the three files under `viewer/` and the unchanged keychecker `graph.json` into a temporary staging directory, then generates a root redirect to `/keychecker/`. It creates and uses the standalone Vercel project without connecting a Git repository, promotes the static build to the project's public demo alias, and verifies cache-busted hosted file hashes against the source.

After review, remove the preview with `pwsh -File scripts/teardown-static-demo.ps1 -Apply -ConfirmProjectName <project-name>`.
