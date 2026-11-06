-- usage: osascript meeting.applescript <toggle-mic|toggle-cam|toggle-share|leave|status|debug>
-- Prints one line: "<app> <mic> <cam> <share> <meeting>" where app =
-- zoom|teams|none, mic/cam/share = on|off|unknown, meeting = yes|no.
-- app is zoom only while in a Zoom meeting; teams whenever Teams is running.
-- Zoom state is read from its Meeting menu; Teams exposes no readable
-- mic/cam/share state, so those are always "unknown" for Teams.

on zoomMenu()
	tell application "System Events"
		if not (exists process "zoom.us") then return missing value
		tell process "zoom.us"
			if exists menu bar item "Meeting" of menu bar 1 then return menu 1 of menu bar item "Meeting" of menu bar 1
		end tell
	end tell
	return missing value
end zoomMenu

on pick(m, onName, offName)
	tell application "System Events"
		if exists menu item onName of m then return "on"
		if exists menu item offName of m then return "off"
	end tell
	return "unknown"
end pick

on zoomState(m)
	-- "Mute Audio" present means the mic is live; same pattern for video/share.
	return "zoom " & my pick(m, "Mute Audio", "Unmute Audio") & " " & my pick(m, "Stop Video", "Start Video") & " " & my pick(m, "Stop Share", "Start Share") & " yes"
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

-- Focus an app, send Cmd+Shift+<k>, then give focus back.
on focusedKey(proc, k)
	tell application "System Events"
		set prev to first process whose frontmost is true
		set frontmost of process proc to true
		delay 0.25
		keystroke k using {command down, shift down}
		delay 0.15
		try
			if name of prev is not proc then set frontmost of prev to true
		end try
	end tell
end focusedKey

-- Teams has no meeting menu. A call window is any Teams window whose title
-- is not one of the main-window sections ("Chat | ...", "Calendar | ...").
on teamsInCall()
	tell application "System Events"
		if not (exists process "Microsoft Teams") then return false
		set names to name of every window of process "Microsoft Teams"
	end tell
	set sections to {"Chat |", "Activity |", "Calendar |", "Teams |", "Calls |", "Files |", "OneDrive |", "Apps |", "People |", "Copilot |", "Settings |", "Microsoft Teams"}
	repeat with n in names
		set n to n as text
		set isSection to (n is "")
		repeat with s in sections
			if n starts with (s as text) then set isSection to true
		end repeat
		if not isSection then return true
	end repeat
	return false
end teamsInCall

on debugInfo()
	set out to ""
	tell application "System Events"
		if exists process "zoom.us" then
			tell process "zoom.us"
				set out to out & "zoom menus: " & (name of every menu bar item of menu bar 1 as text) & linefeed
				if exists menu bar item "Meeting" of menu bar 1 then set out to out & "zoom Meeting: " & (name of every menu item of menu 1 of menu bar item "Meeting" of menu bar 1 as text) & linefeed
				set out to out & "zoom windows: " & (name of every window as text) & linefeed
			end tell
		end if
		if exists process "Microsoft Teams" then
			set out to out & "teams windows: " & (name of every window of process "Microsoft Teams" as text) & linefeed
		end if
	end tell
	return out
end debugInfo

on run argv
	set cmd to item 1 of argv
	set AppleScript's text item delimiters to " | "
	if cmd is "debug" then return my debugInfo()
	set m to my zoomMenu()
	if m is not missing value then
		-- Report the state we just set; the menu itself updates a moment later.
		if cmd is "toggle-mic" then
			set i to my clickFirst(m, {"Mute Audio", "Unmute Audio"})
			return "zoom " & item (i + 1) of {"unknown", "off", "on"} & " unknown unknown yes"
		end if
		if cmd is "toggle-cam" then
			set i to my clickFirst(m, {"Stop Video", "Start Video"})
			return "zoom unknown " & item (i + 1) of {"unknown", "off", "on"} & " unknown yes"
		end if
		if cmd is "toggle-share" then
			set i to my clickFirst(m, {"Stop Share", "Start Share"})
			if i is 0 then my focusedKey("zoom.us", "s")
			return "zoom unknown unknown " & item (i + 1) of {"unknown", "off", "on"} & " yes"
		end if
		if cmd is "leave" then
			-- Zoom asks for confirmation (and offers "End for all" to hosts).
			if my clickFirst(m, {"Leave Meeting", "Leave meeting", "End Meeting", "End meeting"}) is 0 then
				tell application "System Events" to tell process "zoom.us"
					set frontmost to true
					try
						perform action "AXRaise" of window "Zoom Meeting"
					end try
					delay 0.25
					keystroke "w" using {command down}
				end tell
			end if
			return "zoom unknown unknown unknown yes"
		end if
		return my zoomState(m)
	end if
	tell application "System Events" to set teamsUp to exists process "Microsoft Teams"
	if teamsUp then
		if cmd is "toggle-mic" then my focusedKey("Microsoft Teams", "m")
		if cmd is "toggle-cam" then my focusedKey("Microsoft Teams", "o")
		if cmd is "toggle-share" then my focusedKey("Microsoft Teams", "e")
		if cmd is "leave" then my focusedKey("Microsoft Teams", "h")
		if my teamsInCall() then return "teams unknown unknown unknown yes"
		return "teams unknown unknown unknown no"
	end if
	return "none unknown unknown unknown no"
end run
