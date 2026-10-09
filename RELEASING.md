# Windows releases

Use Node 24 and npm 11.12.1 on Windows x64. Keep the package name `bridge`, product
name `Bridge`, and app ID `com.electron.bridge` stable so the existing installation
and user-data directory remain compatible. Do not enable deletion of app data
on uninstall. Public release titles and installer filenames identify the RockList
build. The upstream deep-link PR remains independent of fork release changes.

1. Fetch upstream master and integrate its changes on a feature branch.
2. Update package.json and package-lock.json together. Use a new stable version.
3. Run `npm ci`, `npm test`, and `npm run build:windows -- --publish never`.
4. Run `npm run test:installed`. This silently installs the actual NSIS installer
   in a disposable Windows CI runner, checks the protocol registration, and tests
   startup and running-app links with isolated settings and synthetic chart data.
5. Merge the checked branch into this fork's master, then push its matching `v*`
   tag. The release workflow repeats validation, builds the installer, verifies
   its embedded update source, and publishes installer, blockmap, update metadata,
   and SHA-256 checksums after the tests pass. GitHub supplies source archives for
   that exact tag alongside the binary assets.

The installer test uses Playwright's Electron API because browser-only automation
cannot validate Electron IPC, Windows protocol registration, or native downloads.
Its synthetic downloads never request real chart files. Screenshots and results
are retained as CI artifacts. A physical-machine SmartScreen/browser prompt test
is still useful; CI cannot represent every Windows security policy.

Do not replace assets for an already published version. Publish a new version to
correct a released build. Updates must always point to Jamesllllllllll/Bridge,
not the upstream repository. Keep LICENSE and NOTICE.md in distributed builds.
