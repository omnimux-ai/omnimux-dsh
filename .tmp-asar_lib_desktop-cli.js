import { t as assertDesktopProfileName } from "./profile-manager-DbL_ylQE.js";
import { t as installProfilePackageResolver } from "./module-resolution-1XInpEvI.js";
import { r as withoutForwardedDesktopPnpmPolicy } from "./pnpm-policy-Dj9BWmx3.js";
import { t as packagedDependencyPath } from "./packaged-runtime-path-keWRwWbO.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { resolveProfileDir } from "@deepseek-ai/dsh-app-boot";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
//#region src/desktop-cli.ts
/** Private RunAsNode bootstrap for the packaged DeepSeek Harness CLI. */
const RUN_AS_NODE = "ELECTRON_RUN_AS_NODE";
const DEFAULT_PROFILE = "DSH_DESKTOP_DEFAULT_PROFILE";
const DSH_ENTRY_URL = pathToFileURL(packagedDependencyPath(import.meta.url, "@deepseek-ai/dsh/lib/bin.js")).href;
function clearElectronRunAsNode(environment) {
	for (const key of Object.keys(environment)) if (key.toUpperCase() === RUN_AS_NODE) delete environment[key];
}
function withDefaultDesktopProfile(argv, profileName) {
	assertDesktopProfileName(profileName);
	if (argv.some((argument) => argument === "--profile" || argument.startsWith("--profile="))) return [...argv];
	const first = argv[0];
	if (first === "web" || first === "--help" || first === "-h" || first === "--version" || first === "-V") return [...argv];
	if (first === "plugin") return [
		"plugin",
		"--profile",
		profileName,
		...argv.slice(1)
	];
	return [
		"--profile",
		profileName,
		...argv
	];
}
function takeDefaultProfile(environment) {
	let profileName;
	for (const key of Object.keys(environment)) {
		if (key.toUpperCase() !== DEFAULT_PROFILE) continue;
		const value = environment[key];
		if (value !== void 0 && profileName !== void 0 && value !== profileName) throw new Error("dsh-desktop: conflicting default profile environment values");
		profileName ??= value;
		delete environment[key];
	}
	return profileName;
}
/** Return the Profile selected by one normalized DSH invocation. */
function selectedDesktopCliProfile(argv) {
	if (argv[0] === "web") return "web";
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--profile") {
			const profile = argv[index + 1];
			if (profile !== void 0 && profile.length > 0) return profile;
		}
		if (argument?.startsWith("--profile=") === true) {
			const profile = argument.slice(10);
			if (profile.length > 0) return profile;
		}
	}
}
/** Resolve one CLI Profile through the official home/profile path contract. */
function desktopCliProfileManifestUrl(profileName, environment) {
	const home = resolveDshHome(void 0, environment);
	const profileRoot = join(home, "profiles");
	const profileDirectory = resolveProfileDir(profileName, home);
	if (dirname(profileDirectory) !== profileRoot) throw new Error(`dsh-desktop: unsafe CLI profile path for ${JSON.stringify(profileName)}`);
	return pathToFileURL(join(profileDirectory, "package.json")).href;
}
/**
* Enter the packaged DSH CLI without any plugin-install transaction wrapper.
* Manual plugin commands and Market operations rely on unified checkpoints.
*/
async function runDesktopDshCli(environment = process.env, load = (url) => import(url), argv = process.argv) {
	const profileName = takeDefaultProfile(environment);
	clearElectronRunAsNode(environment);
	const selected = profileName === void 0 ? argv.slice(2) : withDefaultDesktopProfile(argv.slice(2), profileName);
	argv.splice(2, argv.length - 2, ...withoutForwardedDesktopPnpmPolicy(selected));
	const selectedProfile = selectedDesktopCliProfile(argv.slice(2));
	const releaseResolver = selectedProfile !== void 0 && /([\\/])app\.asar\1/u.test(fileURLToPath(DSH_ENTRY_URL)) ? installProfilePackageResolver(desktopCliProfileManifestUrl(selectedProfile, environment)) : void 0;
	if (releaseResolver === void 0) {
		await (await load(DSH_ENTRY_URL)).runCli({ allowDesktopProfile: true });
		return;
	}
	const releaseAtExit = () => {
		releaseResolver();
	};
	process.once("exit", releaseAtExit);
	try {
		await (await load(DSH_ENTRY_URL)).runCli({ allowDesktopProfile: true });
	} catch (cause) {
		process.off("exit", releaseAtExit);
		releaseResolver();
		throw cause;
	}
}
function isDirectExecution() {
	const entry = process.argv[1];
	return entry !== void 0 && fileURLToPath(import.meta.url) === entry;
}
if (isDirectExecution()) runDesktopDshCli().catch((cause) => {
	process.stderr.write(`dsh-desktop: failed to start packaged dsh: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`);
	process.exitCode = 1;
});
//#endregion
export { clearElectronRunAsNode, desktopCliProfileManifestUrl, runDesktopDshCli, selectedDesktopCliProfile, withDefaultDesktopProfile };

//# sourceMappingURL=desktop-cli.js.map