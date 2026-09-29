// Expo merges this on top of app.json, which stays the static, committed
// config. Anything that is specific to ONE developer's machine or Apple
// account belongs here, read from the environment, not in app.json.
//
// appleTeamId in particular: it is required to sign a build for a physical
// device, but a committed value is one person's team. Anybody else who clones
// this repo and runs `yarn example ios:device` then gets a signing failure
// against a team they are not a member of, which reads as a broken example
// rather than as missing local setup.
//
// Set it for a device build:
//
//   APPLE_TEAM_ID=XXXXXXXXXX yarn example ios:device
//
// Simulator builds do not need it.
module.exports = ({ config }) => {
  const appleTeamId = process.env.APPLE_TEAM_ID?.trim();

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(appleTeamId ? { appleTeamId } : {}),
    },
  };
};
