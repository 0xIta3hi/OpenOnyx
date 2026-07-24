cask "openonyx" do
  version "1.0.0"

  on_arm do
    sha256 "REPLACE_WITH_ARM64_DMG_SHA256"
    url "https://github.com/OpenOnyx/OpenOnyx/releases/download/v#{version}/OpenOnyx-#{version}-arm64.dmg"
  end

  on_intel do
    sha256 "REPLACE_WITH_X64_DMG_SHA256"
    url "https://github.com/OpenOnyx/OpenOnyx/releases/download/v#{version}/OpenOnyx-#{version}.dmg"
  end

  name "OpenOnyx"
  desc "Local-first knowledge management app built around Markdown and graph navigation"
  homepage "https://github.com/OpenOnyx/OpenOnyx"

  app "OpenOnyx.app"

  zap trash: [
    "~/Library/Application Support/OpenOnyx",
    "~/Library/Preferences/com.openonyx.app.plist",
    "~/Library/Saved Application State/com.openonyx.app.savedState",
  ]
end
