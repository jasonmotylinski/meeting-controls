-- usage: osascript meeting.applescript <toggle-mic|toggle-cam|status>
-- Prints one line: "<app> <mic> <cam>" where app = zoom|teams|none and
-- mic/cam = on|off|unknown. Zoom state is read from its Meeting menu;
-- Teams exposes no readable state, so it is always "unknown".

on zoomMenu()
	tell application "System Events"
		if not (exists process "zoom.us") then return missing value
		tell process "zoom.us"
			if exists menu bar item "Meeting" of menu bar 1 then return menu 1 of menu bar item "Meeting" of menu bar 1
		end tell
	end tell
	return missing value
end zoomMenu

on zoomState(m)
	tell application "System Events"
		set mic to "unknown"
		set cam to "unknown"
		if exists menu item "Mute Audio" of m then set mic to "on"
		if exists menu item "Unmute Audio" of m then set mic to "off"
		if exists menu item "Stop Video" of m then set cam to "on"
		if exists menu item "Start Video" of m then set cam to "off"
	end tell
	return "zoom " & mic & " " & cam
end zoomState

-- Click the first item that exists (one AX call per attempt, no exists check).
-- Returns the index of the clicked item, or 0.
on clickFirst(m, names)
	tell application "System Events"
		repeat with i from 1 to count of names
			try
				click menu item (item i of names) of m
				return i
			end try
		end repeat
	end tell
	return 0
end clickFirst

on teamsKey(k)
	tell application "System Events"
		set prev to first process whose frontmost is true
		set frontmost of process "Microsoft Teams" to true
		delay 0.25
		keystroke k using {command down, shift down}
		delay 0.15
		try
			set frontmost of prev to true
		end try
	end tell
end teamsKey

on run argv
	set cmd to item 1 of argv
	set m to my zoomMenu()
	if m is not missing value then
		-- Report the state we just set; the menu itself updates a moment later.
		if cmd is "toggle-mic" then
			set i to my clickFirst(m, {"Mute Audio", "Unmute Audio"})
			return "zoom " & item (i + 1) of {"unknown", "off", "on"} & " unknown"
		end if
		if cmd is "toggle-cam" then
			set i to my clickFirst(m, {"Stop Video", "Start Video"})
			return "zoom unknown " & item (i + 1) of {"unknown", "off", "on"}
		end if
		return my zoomState(m)
	end if
	tell application "System Events" to set teamsUp to exists process "Microsoft Teams"
	if teamsUp then
		if cmd is "toggle-mic" then my teamsKey("m")
		if cmd is "toggle-cam" then my teamsKey("o")
		return "teams unknown unknown"
	end if
	return "none unknown unknown"
end run
