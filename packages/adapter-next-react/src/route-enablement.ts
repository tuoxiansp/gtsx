const runelightDevEnvName = "RUNELIGHT_DEV"

export function isRunelightNextRouteEnabled(): boolean {
  return process.env[runelightDevEnvName] === "1"
}
