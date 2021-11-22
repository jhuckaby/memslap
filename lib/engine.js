// MemSlap Server Component
// Copyright (c) 2021 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var cp = require('child_process');
var Path = require('path');
var Component = require("pixl-server/component");
var Tools = require("pixl-tools");
var async = Tools.async;
var si = require('systeminformation');

var Player = require('play-sound')({});
const Notifier = require('node-notifier');
const nc = new Notifier.NotificationCenter();

module.exports = class MemSlap extends Component {
	
	startup(callback) {
		// start app service
		var self = this;
		
		// use global config for our component
		this.config = this.server.config;
		
		this.logDebug(3, "MemSlap engine starting up" );
		this.iconFile = Path.resolve( Path.join( Path.dirname(__dirname), 'images', 'slap.png' ) );
		this.snoozed = {};
		
		// reinit on config reload
		this.config.on('reload', this.reloadConfig.bind(this));
		
		// handle config errors
		this.config.on('error', function(err) {
			self.logError('config', ''+err);
		});
		
		this.server.on('minute', this.check.bind(this));
		
		this.reloadConfig();
		callback();
	}
	
	reloadConfig() {
		// preprocess config
		var monitors = this.config.get('monitors');
		
		// precompile and combine regular expressions
		monitors.forEach( function(mon) {
			['name_matches', 'name_excludes', 'path_matches', 'path_excludes'].forEach( function(key) {
				if (!(key in mon)) return;
				mon[key] = new RegExp( '(' + mon[key].join(')|(') + ')' );
			} );
			
			if (typeof(mon.max_mem) == 'string') mon.max_mem = Tools.getBytesFromText(mon.max_mem);
			if (mon.snooze_time && (typeof(mon.snooze_time) == 'string')) mon.snooze_time = Tools.getSecondsFromText(mon.snooze_time);
			
			if (!mon.signal) mon.signal = 'SIGTERM';
		} );
	}
	
	check(dargs) {
		// check processes for memory leaks
		var self = this;
		var monitors = this.config.get('monitors');
		var now = Tools.timeNow(true);
		this.logDebug(9, "Running process check");
		
		// expire old snoozed
		for (var pid in this.snoozed) {
			if (now > this.snoozed[pid]) delete this.snoozed[pid];
		}
		
		si.processes( function(data) {
			var procs = data.list;
			
			procs.forEach( function(proc) {
				proc.mem = proc.memRss * 1024; // this is reported in KB for some reason
				proc.path = Path.join( proc.path, proc.name ); // this is only the parent path for some reason
				
				// fix application name (often times the binary name is not the app name)
				if (proc.path.match(/\/([^\/]+?)\.app\/Contents/)) {
					proc.name = RegExp.$1;
				}
			});
			
			// rollup child processes mem into apps
			procs.forEach( function(parent) {
				if (!parent.path.match(/^(.+\.app\/Contents).+$/)) return;
				procs.forEach( function(proc) {
					if (proc.parentPid == parent.pid) parent.mem += proc.mem;
				});
			});
			
			monitors.forEach( function(mon) {
				if (!mon.enabled) return;
				
				var offenders = procs.filter( function(proc) {
					if (!proc.pid) return false; // never slap PID 0
					if (proc.mem <= mon.max_mem) return false;
					if (mon.name_matches && !proc.name.match(mon.name_matches)) return false;
					if (mon.name_excludes && proc.name.match(mon.name_excludes)) return false;
					if (mon.path_matches && !proc.path.match(mon.path_matches)) return false;
					if (mon.path_excludes && proc.path.match(mon.path_excludes)) return false;
					if ((proc.pid in self.snoozed) && (now < self.snoozed[proc.pid])) {
						self.logDebug(6, "Process is snoozed, skipping slap", proc);
						return false;
					}
					return true;
				} );
				
				offenders.forEach( function(proc) {
					self.slap(proc, mon);
				});
				
				if (!offenders.length) self.logDebug(9, "No offenders found");
			}); // foreach monitor
		}); // si.processes
	}
	
	slap(proc, mon) {
		// slap a proc
		var self = this;
		var timeout_sec = 15;
		this.logDebug(4, "Process is being slapped", { proc, mon });
		
		if (!mon.prompt) {
			// slap and we're done
			this.killProcess( proc, mon );
			return;
		}
		
		// prompt first
		var opts = {
			title: 'MemSlap',
			message: proc.name + ' is using ' + Tools.getTextFromBytes(proc.mem) + ' of memory. Slap it?',
			icon: this.iconFile,
			contentImage: this.getAppIcon(proc),
			closeLabel: 'No',
			actions: 'Yes',
			timeout: timeout_sec
		};
		if (mon.sound) opts.sound = mon.sound;
		
		var finished = false;
		var timer = null;
		
		var finish = function(err, response, metadata) {
			if (!metadata || !metadata.activationType) return;
			self.logDebug(9, "Notify callback fired", metadata);
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			
			switch (metadata.activationType) {
				case 'actionClicked':
					// i.e. Yes, kill
					self.logDebug(4, "User clicked yes");
					self.killProcess(proc, mon);
				break;
				
				case 'closed':
					// i.e. No, snooze
					self.logDebug(4, "User clicked no");
					if (mon.snooze_time) {
						self.logDebug(5, "Process is being snoozed for " + mon.snooze_time + " sec", proc);
						self.snoozed[proc.pid] = Tools.timeNow(true) + mon.snooze_time;
					}
				break;
				
				case 'contentsClicked':
					// default click on notification, not on button per se
					self.logDebug(4, "User clicked notification");
					if (mon.click_action == 'kill') self.killProcess(proc, mon);
				break;
				
				case 'timeout':
					// user let notification expire
					self.logDebug(4, "Notification timed out");
					if (mon.timeout_action == 'kill') self.killProcess(proc, mon);
					else if (mon.snooze_time) {
						self.logDebug(5, "Process is being snoozed for " + mon.snooze_time + " sec", proc);
						self.snoozed[proc.pid] = Tools.timeNow(true) + mon.snooze_time;
					}
				break;
			}
		};
		
		nc.notify( opts, finish );
		
		// sometimes the notify timeout doesn't work, so add our own as backup
		timer = setTimeout( function() {
			finish(null, "timeout", { activationType: 'timeout' });
		}, (timeout_sec + 1) * 1000 );
	}
	
	killProcess(proc, mon) {
		// kill process and notify user
		var self = this;
		
		this.logDebug(3, "Killing process with " + mon.signal, proc);
		process.kill( proc.pid, mon.signal );
		delete this.snoozed[proc.pid]; // cleanup
		if (!mon.notify) return;
		
		var opts = {
			title: 'MemSlap',
			message: proc.name + ' was slapped (' + Tools.getTextFromBytes(proc.mem) + ').',
			icon: this.iconFile,
			contentImage: this.getAppIcon(proc)
		};
		
		if (mon.slap) {
			var snd = (typeof(mon.slap) == 'string') ? mon.slap : Path.resolve( Path.join( Path.dirname(__dirname), 'sounds', 'slap.mp3' ) );
			Player.play(snd, function(err) {
				if (err) self.logError('sound', "Failed to play sound: " + snd + ": " + err);
			});
		}
		
		nc.notify(opts);
	}
	
	getAppIcon(proc) {
		// try to guess app icon's location, or fall back to memslap icon
		// /Applications/Tweetbot.app/Contents/MacOS/Tweetbot
		// /Applications/Tweetbot.app/Contents/Info.plist
		if (proc.path.match(/^(.+\.app\/Contents).+$/)) {
			var base_app_path = RegExp.$1;
			var plist_file = base_app_path + '/Info.plist';
			if (fs.existsSync(plist_file)) {
				var plist_raw = null;
				try { plist_raw = fs.readFileSync(plist_file, 'utf8'); }
				catch (e) {;}
				
				// <key>CFBundleIconFile</key>
				// <string>AppIcon</string>
				plist_raw = plist_raw.replace(/\n/g, ' ');
				if (plist_raw.match(/<key>CFBundleIconFile<\/key>\s*<string>(.+?)<\/string>/)) {
					var icn_filename = RegExp.$1;
					if (!icn_filename.match(/\.\w+$/)) icn_filename += '.icns';
					
					var icn_file = base_app_path + '/Resources/' + icn_filename;
					if (fs.existsSync(icn_file)) return icn_file;
				}
			}
		}
		return this.iconFile;
	}
	
	logError(code, msg, data) {
		// proxy request to system logger with correct component
		this.logger.set( 'component', this.__name );
		this.logger.error( code, msg, data );
		
		Notifier.notify({
			title: 'MemSlap Error',
			message: msg,
			sound: true
		});
	}
	
	shutdown(callback) {
		// shutdown service
		var self = this;
		this.logDebug(2, "Shutting down MemSlap");
	}
	
}; // class

