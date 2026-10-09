# Bridge — RockList build

[**Download the Windows installer**](https://github.com/Jamesllllllllll/Bridge/releases/latest)

Bridge searches for rhythm game charts and downloads them into your Clone Hero or YARG library. This independently maintained build adds automatic downloads from exact-chart web links while keeping Bridge's normal download queue, library folders, file formats, and settings.

Based on [Geomitron/Bridge](https://github.com/Geomitron/Bridge), with thanks to its original authors and contributors. This is a community fork, not an official upstream release. Updates for this build come from this repository.

## Install and use

1. Download **Bridge-RockList-Setup-3.4.6.exe** from the [latest release](https://github.com/Jamesllllllllll/Bridge/releases/latest).
2. Close Bridge if it is running, then install this build. Keep your existing Bridge settings and library; there is no need to uninstall first.
3. In Bridge's Settings, choose your default library folder and preferred chart-folder or `.sng` format.
4. Open a supported chart link in your browser and allow it to open Bridge. Bridge finds the exact chart and starts the download using your settings, even if the app was closed.

If you have not chosen a library folder, Bridge opens Settings and waits for you to choose one before starting the download. Progress, cancellation, errors, and retries use Bridge's existing download queue. Charts already present at their destination are not downloaded again.

This build is ready for links from RockList and other websites. **RockList's website integration is not available yet.** Regular searching and downloading in Bridge works independently.

Windows 10/11 x64 installers are provided here. The installer is unsigned, so Windows may show an unfamiliar-app warning. Install only the asset published in this repository.

## Features

- ✅ Find all charts that can be found on Chorus Encore.
- ✅ Download any chart directly into your chart library as a chart folder or `.sng` file.
- ✅ Multi-select songs to add to the download queue.
- ✅ Cancel and retry downloads.
- ✅ In-app update checking and downloading.
- ✅ A variety of themes.
- ✅ Advanced song search.
- ✅ Chart issue scanner (for people making charts).

## Deep links

Installed copies of Bridge can open an exact chart from another application or website using its MD5 hash:

`bridge://chart/0123456789abcdef0123456789abcdef`

The link opens the exact chart and automatically adds it to Bridge's download queue. Links contain only a 32-character chart MD5; search parameters, file paths, and arbitrary download URLs are not supported. Multiple links received during startup are queued.

### Development

Built using Node.js 22.12 or later, Angular, and Electron.

See [RELEASING.md](RELEASING.md) for reproducible Windows builds and release verification.

Learn how to install Node.js [here](https://nodejs.dev/en/download/)

After installing Node.js and cloning the repository, install dependencies and run development with:

```
$ npm install && npm start
```

### Upstream community and attribution

To discuss the project and make suggestions, please join the [Discord](https://discord.gg/cqaUXGm)

To support the upstream chart service, please check out its [Patreon](https://www.patreon.com/ChorusEncore701)

## License

Bridge and this modified build are distributed under [GPL-3.0](LICENSE). Source for each installer is available at its matching release tag. See [NOTICE.md](NOTICE.md) for fork provenance.
