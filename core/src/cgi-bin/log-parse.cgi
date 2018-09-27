#!/usr/bin/env ruby

# Grab the current time
t = Time.now

# Grab the CGI library for Ruby and create the object from the call
require 'cgi'
cgi = CGI.new

# Write the return header
puts "Content-Type:application/octet-stream; name=\"parsedLog.out\"\r\n"
puts "Content-Disposition: attachment; filename=\"parsedLog.out\"\r\n\n"

# Grab the parameters from the call
params = cgi.params

# Grab the environment related variables
# The name of the ESP
espname = ""
if params.has_key?"espname"
    espnamefile = params["espname"].first
    espname = espnamefile.read
end

# The type of ESP deployment
esptype = ""
if params.has_key?"esptype"
    esptypefile = params["esptype"].first
    esptype = esptypefile.read
end
# The mode that was used to generate the log file
espmode = ""
if params.has_key?"espmode"
    espmodefile = params["espmode"].first
    espmode = espmodefile.read
end

# Now write the file that was uploaded locally
server_file = "/data/uploads/"
if params.has_key?"logfile"
    file = params["logfile"].first
    server_file = server_file + espname + "-" + esptype + "-" + espmode + "-" + t.year.to_s + "-" + t.month.to_s + "-" + t.mday.to_s + "-" + t.hour.to_s + "-" + t.min.to_s + "-" + t.sec.to_s + "-" + file.original_filename
    File.open(server_file.untaint, "w") do |f|
        f << file.read
    end
end

# Set the environment variables based on this inputs
ENV["ESPconfigPath"] = "/home/esp/ESP2Gscript/type/" + esptype + ":/home/esp/ESP2Gscript/type/" + esptype + "/" + espname
ENV["ESPmode"] = espmode
ENV["ESPname"] = espname

# Uncomment this for debugging purposes to check the environment
#ENV.to_a.each do |item|
#    puts item[0] + "=" + item[1]
#end

require 'framework'

logFn = ESP.logFn
follow = initString = cleanupString = maxLines = nil
q = []
# KGomes: I just set this to true to give fully detailed logs
#default = filter = 'not (is Log::Msg or is Log::Debug)'
default = filter = 'true'
logFn = server_file
$datestampAll=true
$sourceStampAll=true

module ESP
  module_function
  def simulation?
    :dumplog
  end
end

require 'logproc'  #miscelleneous defs for processing log objects

#try to display full resolution moisture sensor data
begin
  Can.sensors[:waterAlarm].update :threshold=>nil, :format=>'%.2f%% wet'
rescue Exception=>err
  STDERR.puts "Omitting high resolution Can moisture because...",
              err.inspect, err.backtrace
end

class Object
  alias_method :is, :is_a?  #so simple filters do not require quoting
  alias_method :only, :is_a?
  Quit = Log::Reader::Quit
  LastMatch = Log::Reader::LastMatch
end

eval initString if initString  #after the basics are set up
Log::Entry.module_eval "def cleanup; #{cleanupString}; end" if cleanupString

filter = ARGV.join ' ' unless ARGV.empty?  #unless filter expression specified

# KGomes: I had to force this to be a file as stdin doesn't exist in a web server
#logFile = $stdin.tty? ? File.new(logFn) : $stdin
logFile = File.new(logFn)

Log::Entry.module_eval "def logFilter; #{filter}; end"
Log::Entry.module_eval "def defaultFilter; #{default}; end"

class LogReader < Log::Reader
  def hitEOF?
    true
  end
end

class LogFollower < Log::Reader
  #we rely on the fact that the Log::Reader uses only gets
  #so that is overridden such that is never returns eof?
  def initialize logFile, wt4eof, pollInterval, atTail, parsers={}
    raise ArgumentError, "polling interval of #{pollInterval} < 0.01s" if
      pollInterval < 0.01
    @hitEOF = !wt4eof
    @pollInterval=pollInterval
    @atTail=atTail
    super logFile, parsers
  end
  def eof?
    false
  end
  def gets(*args)
    loop {
      result=@stream.gets(*args)
      return result if result  #pass thru if not at end of file
      unless @hitEOF
        @atTail.call
        @hitEOF = true
      end
      sleep @pollInterval
    }
  end
  def hitEOF?
    @hitEOF
  end
end

Log::Object.backtrace if $backtrace

if $datestampAll or $sourceStampAll
  def putLogEntry e
    e.log.lastTime=nil if $datestampAll
    e.log.lastSource=nil if $sourceStampAll
    puts e.logEntry
  end
else
  def putLogEntry e
    puts e.logEntry
  end
end

dumpTail = proc do
  q.each {|entry| putLogEntry entry}
  q.clear
end

start = if follow
  LogFollower.new(logFile, maxLines, follow, dumpTail, Targets)
else
  if maxLines
    class LogReader
      def hitEOF?
        false
      end
    end
  end
  LogReader.new(logFile, Targets)
end

reader = start.dup

unless logFile.stat.pipe?
  print "Following " if follow
  print "Tail of " unless reader.hitEOF?
  puts "ESP log \"#{logFn}\" entries matching:\n "<<filter
end

maxLines ||= 0
e = lastEntry = nil
begin
  reader.each do |e|
    if e.respond_to? :logEntry
      lastEntry = e
      if !e.respond_to?(:logFilter) || e.logFilter
        begin
          if reader.hitEOF?
            putLogEntry e
          elsif maxLines > 0
            q.push e
            q.shift while q.size > maxLines
          end
        rescue Interrupt, StandardError => err
          STDERR.puts err.inspect
        end
      end
    end
  end
  dumpTail.call
rescue Quit => quit
  dumpTail.call
  putLogEntry e if quit.is_a? LastMatch
  puts quit
end
lastEntry.cleanup if lastEntry.respond_to? :cleanup
