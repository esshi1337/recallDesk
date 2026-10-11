module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'recall-desk',
    ignore: [/^\/(?!dist(?:\/|$)|dist-electron(?:\/|$)|assets(?:\/|$)|package\.json$).+/]
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['linux', 'darwin', 'win32'] }]
};
