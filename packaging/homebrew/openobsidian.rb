cask "openobsidian" do
  version "1.0.0"

  on_arm do
    sha256 "REPLACE_WITH_ARM64_DMG_SHA256"
    url "https://github.com/OpenObsidian/OpenObsidian/releases/download/v#{version}/OpenObsidian-#{version}-arm64.dmg"
  end

  on_intel do
    sha256 "REPLACE_WITH_X64_DMG_SHA256"
    url "https://github.com/OpenObsidian/OpenObsidian/releases/download/v#{version}/OpenObsidian-#{version}.dmg"
  end

  name "OpenObsidian"
  desc "Local-first knowledge management app built around Markdown and graph navigation"
  homepage "https://github.com/OpenObsidian/OpenObsidian"

  app "OpenObsidian.app"

  zap trash: [
    "~/Library/Application Support/OpenObsidian",
    "~/Library/Preferences/com.openobsidian.app.plist",
    "~/Library/Saved Application State/com.openobsidian.app.savedState",
  ]
end
