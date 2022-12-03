# Changelog

## v0.6
* Updated UI and implemented floating panels
* Added Settings panel
  - Added option to manually set game build
  - Added setting to change node display text
* Added Task ID (hex) option for node display text
* Added support for Sly 3 July build
* Changed default node text to address
* Fixed an issue with incorrect file paths in release builds
* Add some more task descriptions for Episodes 0 (tutorial), 2, 8
* Add the ability to save settings

## v0.5
* App doesn't crash when PCSX2 or Sly aren't running
* Added task names/descriptions for Sly 2 Episodes 1 and 3
  - Special thanks to [https://github.com/zzamizz](zzamizz) for helping identify tasks by name
* Tweaked graph appearance
* Added app icon and custom titlebar
* Temporarily removed state forcing (broken)

## v0.4
* Added support for Sly 3: Honor Among Thieves
* Nodes now display their unique ID rather than their memory address
* Added context menu options:
  - Copy node address to clipboard
  - Refresh graph (for when it breaks)
  - Export graph as DOT text
  - Export current view as PNG
* Minor tweaks/adjustments

## v0.3
* Added context menu to force task states
  - Forcing a task state recursively updates the DAG (WIP)
* Fixed bug where Episode 3 DAG didn't render #1
* Minor tweaks/adjustments

## v0.2
* Tweaked window style
* Resolved #3 window resizing issues
* Added Episode ID in the top left corner
* Set cursor to hourglass while the graph is updating

## v0.1
* Initial version