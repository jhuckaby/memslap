#!/bin/sh
#
# Control script designed to allow an easy command line interface
# to controlling any binary.  Written by Marc Slemko, 1997/08/23
# Modified for MemSlap, Joe Huckaby, 2021/11/20
# 
# The exit codes returned are:
#	0 - operation completed successfully
#	2 - usage error
#	3 - binary could not be started
#	4 - binary could not be stopped
#	8 - configuration syntax error
#
# When multiple arguments are given, only the error from the _last_
# one is reported.  Run "*ctl help" for usage info
#
#
# |||||||||||||||||||| START CONFIGURATION SECTION  ||||||||||||||||||||
# --------------------                              --------------------
# 
# fix up our path just in case
PATH=/sbin:/bin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:$PATH

# the name of your binary
NAME="MemSlap"

# home directory
SCRIPT=`node -p 'require("fs").realpathSync(process.argv[1]);' "$0"`

if [ "x$SCRIPT" = "x" ] ; then 
	echo "ERROR: Cannot locate script: $0"
	exit 1;
fi

# home directory
DIR=`dirname $SCRIPT`
HOMEDIR=`dirname $DIR`

# the path to your binary, including options if necessary
BINARY="node $HOMEDIR/lib/main.js"

# the path to your PID file
PIDFILE="$HOME/Library/Logs/memslap.pid"

# --------------------                              --------------------
# ||||||||||||||||||||   END CONFIGURATION SECTION  ||||||||||||||||||||

ERROR=0
ARGV="$@"
if [ "x$ARGV" = "x" ] ; then 
    ARGS="help"
fi

for ARG in $@ $ARGS
do
    # check for pidfile
    if [ -f $PIDFILE ] ; then
		PID=`cat $PIDFILE`
	if [ "x$PID" != "x" ] && kill -0 $PID 2>/dev/null ; then
	    STATUS="$NAME running (pid $PID)"
	    RUNNING=1
	else
	    STATUS="$NAME not running (pid $PID?)"
	    RUNNING=0
	fi
    else
		STATUS="$NAME not running (no pid file)"
		RUNNING=0
    fi

    case $ARG in
    start)
		if [ $RUNNING -eq 1 ]; then
		    echo "$ARG: $NAME already running (pid $PID)"
		    continue
		fi
		echo "$0 $ARG: Starting up $NAME..."
		if $BINARY ; then
		    echo "$0 $ARG: $NAME started"
		else
		    echo "$0 $ARG: $NAME could not be started"
		    ERROR=3
		fi
	;;
    stop)
		if [ $RUNNING -eq 0 ]; then
		    echo "$ARG: $STATUS"
		    continue
		fi
		if kill $PID ; then
	            while [ "x$PID" != "x" ] && kill -0 $PID 2>/dev/null ; do
	                sleep 1;
	            done
		    echo "$0 $ARG: $NAME stopped"
		else
		    echo "$0 $ARG: $NAME could not be stopped"
		    ERROR=4
		fi
	;;
    restart)
        $0 stop start
	;;
    cycle)
        $0 stop start
	;;
	status)
		echo "$ARG: $STATUS"
	;;
	debug)
		if [ $RUNNING -eq 1 ]; then
		    echo "$ARG: $NAME already running (pid $PID)"
		    continue
		fi
		echo "$0 $ARG: Starting $NAME in debug mode..."
		echo ""
		$BINARY --debug --echo --color
	;;
	boot)
		cd $HOMEDIR
		npm run boot
	;;
	unboot)
		cd $HOMEDIR
		npm run unboot
	;;
	config)
		open "$HOME/Library/Preferences/memslap.json"
	;;
	log)
		open "$HOME/Library/Logs/memslap.log"
	;;
    *)
	echo ""
	echo "Usage: $0 (start|stop|restart|status|boot|unboot|config|log|help)"
	cat <<EOF

start      - Starts $NAME as a daemon.
stop       - Stops $NAME and wait until it actually exits.
restart    - Calls stop, then start (hard restart).
debug      - Starts $NAME in debug move (no fork, log echo).
status     - Checks whether $NAME is currently running.
boot       - Install $NAME as a startup service.
unboot     - Remove $NAME from the startup services.
config     - Open the $NAME configuration file.
log        - Open the $NAME log file.
help       - Displays this screen.

EOF
	ERROR=2
    ;;

    esac

done

exit $ERROR

## ====================================================================
## The Apache Software License, Version 1.1
##
## Copyright (c) 2000 The Apache Software Foundation.  All rights
## reserved.
##
## Redistribution and use in source and binary forms, with or without
## modification, are permitted provided that the following conditions
## are met:
##
## 1. Redistributions of source code must retain the above copyright
##    notice, this list of conditions and the following disclaimer.
##
## 2. Redistributions in binary form must reproduce the above copyright
##    notice, this list of conditions and the following disclaimer in
##    the documentation and/or other materials provided with the
##    distribution.
##
## 3. The end-user documentation included with the redistribution,
##    if any, must include the following acknowledgment:
##       "This product includes software developed by the
##        Apache Software Foundation (http://www.apache.org/)."
##    Alternately, this acknowledgment may appear in the software itself,
##    if and wherever such third-party acknowledgments normally appear.
##
## 4. The names "Apache" and "Apache Software Foundation" must
##    not be used to endorse or promote products derived from this
##    software without prior written permission. For written
##    permission, please contact apache@apache.org.
##
## 5. Products derived from this software may not be called "Apache",
##    nor may "Apache" appear in their name, without prior written
##    permission of the Apache Software Foundation.
##
## THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED
## WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
## OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
## DISCLAIMED.  IN NO EVENT SHALL THE APACHE SOFTWARE FOUNDATION OR
## ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
## SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
## LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF
## USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
## ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
## OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
## OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
## SUCH DAMAGE.
## ====================================================================
##
## This software consists of voluntary contributions made by many
## individuals on behalf of the Apache Software Foundation.  For more
## information on the Apache Software Foundation, please see
## <http://www.apache.org/>.
##
## Portions of this software are based upon public domain software
## originally written at the National Center for Supercomputing Applications,
## University of Illinois, Urbana-Champaign.
##
# 
