const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const releaseDir = path.join(root, "release");
const unpackedDir = path.join(releaseDir, "linux-unpacked");
const buildDir = path.join(root, "build");
const scratchDir = path.join(root, "scratch");

function getDirectorySize(dir) {
  let size = 0;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stat.size;
    }
  }
  return size;
}

async function buildDeb() {
  console.log("Building Debian package...");
  const debPkgDir = path.join(scratchDir, "deb-pkg");
  
  // Clean & recreate structure
  fs.rmSync(debPkgDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(debPkgDir, "DEBIAN"), { recursive: true });
  fs.mkdirSync(path.join(debPkgDir, "opt/OpenObsidian"), { recursive: true });
  fs.mkdirSync(path.join(debPkgDir, "usr/share/applications"), { recursive: true });
  fs.mkdirSync(path.join(debPkgDir, "usr/share/pixmaps"), { recursive: true });
  fs.mkdirSync(path.join(debPkgDir, "usr/share/icons/hicolor/scalable/apps"), { recursive: true });
  fs.mkdirSync(path.join(debPkgDir, "usr/share/icons/hicolor/1024x1024/apps"), { recursive: true });

  // Copy files
  execSync(`cp -r "${unpackedDir}"/* "${path.join(debPkgDir, "opt/OpenObsidian")}"`);
  fs.copyFileSync(
    path.join(buildDir, "icon.png"),
    path.join(debPkgDir, "usr/share/pixmaps/openobsidian.png")
  );
  fs.copyFileSync(
    path.join(buildDir, "icon.png"),
    path.join(debPkgDir, "usr/share/icons/hicolor/scalable/apps/openobsidian.png")
  );
  fs.copyFileSync(
    path.join(buildDir, "icon.png"),
    path.join(debPkgDir, "usr/share/icons/hicolor/1024x1024/apps/openobsidian.png")
  );
  fs.copyFileSync(
    path.join(root, "packaging/aur/openobsidian/openobsidian.desktop"),
    path.join(debPkgDir, "usr/share/applications/openobsidian.desktop")
  );

  // Write control file
  const control = `Package: openobsidian
Version: 1.0.2
Section: utils
Priority: optional
Architecture: amd64
Maintainer: OpenObsidian <openobsidian@gmail.com>
Depends: libgtk-3-0, libnss3, libasound2, libxss1, libxtst6, libsecret-1-0, xdg-utils
Description: A local-first knowledge management tool with graph-based note linking
`;
  fs.writeFileSync(path.join(debPkgDir, "DEBIAN/control"), control);

  // Build
  execSync(`dpkg-deb --root-owner-group --build "${debPkgDir}" "${path.join(releaseDir, "openobsidian_1.0.2_amd64.deb")}"`);
  console.log("Debian package built successfully!");
}

async function buildPacman() {
  console.log("Building Pacman package...");
  const pacmanPkgDir = path.join(scratchDir, "pacman-pkg");
  
  // Clean & recreate structure
  fs.rmSync(pacmanPkgDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(pacmanPkgDir, "opt/OpenObsidian"), { recursive: true });
  fs.mkdirSync(path.join(pacmanPkgDir, "usr/bin"), { recursive: true });
  fs.mkdirSync(path.join(pacmanPkgDir, "usr/share/applications"), { recursive: true });
  fs.mkdirSync(path.join(pacmanPkgDir, "usr/share/pixmaps"), { recursive: true });
  fs.mkdirSync(path.join(pacmanPkgDir, "usr/share/icons/hicolor/scalable/apps"), { recursive: true });
  fs.mkdirSync(path.join(pacmanPkgDir, "usr/share/icons/hicolor/1024x1024/apps"), { recursive: true });

  // Copy files
  execSync(`cp -r "${unpackedDir}"/* "${path.join(pacmanPkgDir, "opt/OpenObsidian")}"`);
  fs.copyFileSync(
    path.join(buildDir, "icon.png"),
    path.join(pacmanPkgDir, "usr/share/pixmaps/openobsidian.png")
  );
  fs.copyFileSync(
    path.join(buildDir, "icon.png"),
    path.join(pacmanPkgDir, "usr/share/icons/hicolor/scalable/apps/openobsidian.png")
  );
  fs.copyFileSync(
    path.join(buildDir, "icon.png"),
    path.join(pacmanPkgDir, "usr/share/icons/hicolor/1024x1024/apps/openobsidian.png")
  );
  fs.copyFileSync(
    path.join(root, "packaging/aur/openobsidian/openobsidian.desktop"),
    path.join(pacmanPkgDir, "usr/share/applications/openobsidian.desktop")
  );

  // Create symlink
  try {
    fs.symlinkSync("/opt/OpenObsidian/openobsidian", path.join(pacmanPkgDir, "usr/bin/openobsidian"));
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }

  // Calculate size in bytes
  const size = getDirectorySize(pacmanPkgDir);

  // Write .PKGINFO
  const pkginfo = `pkgname = openobsidian
pkgver = 1.0.2-1
pkgdesc = A local-first knowledge management tool with graph-based note linking
url = https://github.com/OpenObsidian/OpenObsidian
builddate = ${Math.floor(Date.now() / 1000)}
packager = OpenObsidian <openobsidian@gmail.com>
arch = x86_64
size = ${size}
license = MIT
depend = fuse2
depend = gtk3
depend = nss
depend = libxss
depend = libxtst
depend = libsecret
depend = xdg-utils
`;
  fs.writeFileSync(path.join(pacmanPkgDir, ".PKGINFO"), pkginfo);

  // Build
  execSync(`tar --owner=0 --group=0 --numeric-owner --zstd -cf "${path.join(releaseDir, "openobsidian-1.0.2-1-x86_64.pkg.tar.zst")}" -C "${pacmanPkgDir}" .PKGINFO opt usr`);
  console.log("Pacman package built successfully!");
}

async function main() {
  if (!fs.existsSync(unpackedDir)) {
    console.error(`Error: Unpacked directory not found at ${unpackedDir}`);
    process.exit(1);
  }
  
  fs.mkdirSync(scratchDir, { recursive: true });

  try {
    await buildDeb();
    await buildPacman();
  } catch (err) {
    console.error("Packaging failed:", err);
    process.exit(1);
  }
}

main();
