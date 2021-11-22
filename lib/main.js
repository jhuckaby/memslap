#!/usr/bin/env node

// MemSlap - Main entry point
// Copyright (c) 2021 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var Path = require('path');
var Server = require("pixl-server");

// chdir to the proper server root dir
process.chdir( process.env.HOME );

// Copy sample config if custom one doesn't exist
var user_config_file = Path.resolve("Library/Preferences/memslap.json");
var sample_config_file = Path.join( Path.dirname(__dirname), "conf", "sample-config.json" );

if (!fs.existsSync(user_config_file)) {
	fs.copyFileSync(sample_config_file, user_config_file);
	fs.chmodSync(user_config_file, 0o777);
}

var server = new Server({
	__name: 'MemSlap',
	__version: require('../package.json').version,
	
	configFile: user_config_file,
	
	components: [
		require('./engine.js')
	]
});

server.startup( function() {
	// server startup complete
	process.title = server.__name;
} );
