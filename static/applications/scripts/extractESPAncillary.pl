#!/usr/bin/perl -w

# This script creates CSV files ancillary data for an ESP
use strict;
use Date::Parse;
use File::Copy qw(move);

# Grab the machine name from the command line
my $machine = shift;
my $deployment = shift;
print "Machine " . $machine . ", deployment " . $deployment . "\n";

# Regexps to use
my $dateExpr = '^@\d{2}:\d{2}:\d{2}.\d{2}(\D+)(\d{2})-(\D{3})-(\d{2})';
my $canExpr = '\s{1}Can@(\d{2}:\d{2}:\d{2}),(.+)$';
my @canVars = ();
my @canVarFiles = ();
my $numCanVars = 0;
my $ctdExpr = '^CTD@(\d{2}:\d{2}:\d{2})\S*,(.+)$';
my @ctdVars = ();
my @ctdVarFiles = ();
my $numCTDVars = 0;

# The date place holder
my $dateHolder = "";
my $month = "";

# Open the real.out file and the temp files
open FILE, "<../../instances/" . $machine . "/deployments/" . $deployment . "/data/raw/real.out";
open FILEOUT, ">../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/ctd.csv.tmp";
open FILECANOUT, ">../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/can.csv.tmp";

# First scan through to find the max number of variables and units for each
my @lines = <FILE>;
for (@lines) {
	# Check for a pattern match
    if ($_ =~ /$ctdExpr/) {
    	# The second argument is the list of variables, split them into an array
    	my @variables = split(',',$2);
    	
    	# Now check to see if this list is longer than any before it.  This
    	# assumes that the longest list will be the correct one and that any
    	# additional variables are added on the end ... there is only so much
    	# I can do!
    	if (@variables > $numCTDVars) {
    		# Just blow away the old list of variables and replace it
    		@ctdVars = ();
    		
    		# And the file names
    		@ctdVarFiles = ();

			# Update the number of variables    		
	    	$numCTDVars = @variables;
	    	
	    	# Now loop over the variables and push the variables into
	    	# the array with their units.  I make some guesses here.
	    	my $counter = 0;
	    	foreach(@variables) {
	    		# Look for the pattern
	    		if ($_ =~ /\s*\d+\.*\d*(.*)/) {
	    			# Grab the units label
		    		my $unit = $1;
		    		$unit =~ s/^\s+|\s+$//g;
		    		
		    		# Now if it is something I recognize, put a name
		    		# on the variable
		    		if ($unit eq "C") {
		    			# Temperature
			    		push(@ctdVars,"Temperature (degrees C)");
			    		# Push the file name
			    		push(@ctdVarFiles, "ctd_temperature.csv");
			    	} elsif ($unit eq "m") {
			    		push(@ctdVars,"Depth (m)");
			    		# Push the file name
			    		push(@ctdVarFiles, "ctd_depth.csv");
			    	} elsif ($unit eq "psu") {
			    		# Salinity
			    		push(@ctdVars,"Salinity");
			    		# Push the file name
			    		push(@ctdVarFiles, "ctd_salinity.csv");
			    	} elsif ($unit eq "mg/m^3") {
			    		push(@ctdVars,"Chlorophyll (mg/m^3)");
			    		# Push the file name
			    		push(@ctdVarFiles, "ctd_chlorophyll.csv");
			    	} elsif ($unit eq "%") {
			    		push(@ctdVars,"Light Transmission (%)");
			    		# Push the file name
			    		push(@ctdVarFiles, "ctd_light_transmission.csv");
			    	} elsif ($unit eq "ml/L") {
			    		push(@ctdVars,"Computed Dissolved Oxygen (ml/L)");
			    		# Push the file name
			    		push(@ctdVarFiles, "ctd_computed_dissolved_oxygen.csv");
		    		} else {
		    			# If nothing is recognized, don't guess
			    		push(@ctdVars,"?(" . $unit . ")");
			    		my $tempFilename = $unit;
			    		$tempFilename =~ s/\(.*?\)//gs;
			    		$tempFilename =~ s/^\s+//;
			    		$tempFilename =~ s/\s+$//;
			    		$tempFilename =~ s/\s+/_/gs;
			    		$tempFilename = lc($tempFilename);
			    		# Push the file name
			    		push(@ctdVarFiles, "ctd_" . $tempFilename . ".csv");
		    		}
	    		}
	    	}
	    	
	    	# We have a new set of variable names for the CTD, let's
	    	# create some individual files for those variables.
	    	my $varCounter = 0;
	    	foreach my $ctdVarFile (@ctdVarFiles) {
	    		# Open the file
		    	open VAR_FILE, ">../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/" . $ctdVarFile . ".tmp";
		    	
		    	# Write the header
		    	print VAR_FILE "Date," . $ctdVars[$varCounter] . "\n";
		    	
		    	# Close the file
		    	close VAR_FILE;
		    	
		    	# Bump the index
		    	$varCounter++;
	    	}
    	}
    }	
    # Now let's look for Can data
    if ($_ !~ /\>$/ && $_ =~ /$canExpr/) {
    	# The second argument is the list of variables, split them into an array
    	my @variables = split(',',$2);
    	
    	# Now check to see if this list is longer than any before it.  This
    	# assumes that the longest list will be the correct one and that any
    	# additional variables are added on the end ... there is only so much
    	# I can do!
    	if (@variables > $numCanVars) {
    		# Just blow away the old list of variables and replace it
    		@canVars = ();
    		
    		# And the files as well
    		@canVarFiles = ();
    		
			# Update the number of variables    		
	    	$numCanVars = @variables;
	    	
	    	# Now loop over the variables and push the variables into
	    	# the array with their units.  I make some guesses here.
	    	my $counter = 0;
	    	foreach(@variables) {
	    		# Look for the pattern
	    		if ($_ =~ /\s*\d+\.*\d*(.*)/) {
	    			# Grab the units label
		    		my $unit = $1;
		    		$unit =~ s/^\s+|\s+$//g;
		    		
		    		# Now if it is something I recognize, put a name
		    		# on the variable
		    		if ($unit eq "C") {
			    		push(@canVars,"Temperature (degrees C)");
			    		push(@canVarFiles, "can_temperature.csv");
			    	} elsif ($unit eq "% humidity") {
			    		push(@canVars,"Humidity (%)");
			    		push(@canVarFiles, "can_humidity.csv");
			    	} elsif ($unit eq "psia") {
			    		push(@canVars,"Can Pressure (psia)");
			    		push(@canVarFiles, "can_pressure.csv");
			    	} elsif ($unit eq "V") {
			    		push(@canVars,"Battery Voltage (V)");
			    		push(@canVarFiles, "can_battery_voltage.csv");
			    	} elsif ($unit eq "A") {
			    		push(@canVars,"Instantaneous Current (A)");
			    		push(@canVarFiles, "can_instantaneous_current.csv");
			    	} elsif ($unit eq "A avg") {
			    		push(@canVars,"Average Current (A)");
			    		push(@canVarFiles, "can_average_current.csv");
			    	} elsif ($unit eq "W") {
			    		push(@canVars,"Watts (W)");
			    		push(@canVarFiles, "can_watts.csv");
		    		} else {
		    			# If nothing is recognized, don't guess
			    		push(@canVars,"?(" . $unit . ")");
			    		my $tempFilename = $unit;
			    		$tempFilename =~ s/\(.*?\)//gs;
			    		$tempFilename =~ s/^\s+//;
			    		$tempFilename =~ s/\s+$//;
			    		$tempFilename =~ s/\s+/_/gs;
			    		$tempFilename = lc($tempFilename);
			    		# Push the file name
			    		push(@canVarFiles, "can_" . $tempFilename . ".csv");
		    		}
	    		}
	    	}
	    	
	    	# We have a new set of variable names for the Can, let's
	    	# create some individual files for those variables.
	    	my $varCounter = 0;
	    	foreach my $canVarFile (@canVarFiles) {
	    		# Open the file
		    	open VAR_FILE, ">../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/" . $canVarFile . ".tmp";
		    	
		    	# Write the header
		    	print VAR_FILE "Date," . $canVars[$varCounter] . "\n";
		    	
		    	# Close the file
		    	close VAR_FILE;
		    	
		    	# Bump the index
		    	$varCounter++;
	    	}

    	}
    }	
}

# Close the file
close FILE;

# Print out the header for CTD
print FILEOUT "Date";
foreach(@ctdVars){
	print FILEOUT "," . $_;
}
print FILEOUT "\n";

# And now for the Can
print FILECANOUT "Date";
foreach(@canVars){
	print FILECANOUT "," . $_;
}
print FILECANOUT "\n";

# Open the real.out file
open FILE, "<../../instances/" . $machine . "/deployments/" . $deployment . "/data/raw/real.out";

# A temporary timezone holder because it can change
my $tempTimezoneAbbr;

# Let's keep track of the date and time so we can look for dates that
# go backwards in time.
my $currentCTDDateTimeString;
my $currentCTDDateTime = 0;
my $currentCanDateTimeString;
my $currentCanDateTime = 0;

# And a line counter
my $lineCounter = 0;

# Now let's look for the data
@lines = <FILE>;
for (@lines) {

	# Bump the counter
	$lineCounter++;

	# As I go line by line, I need to make sure I have the date since
	# each line does not have the date in it.
    if ($_ =~ /$dateExpr/) {
    	# Grab the timezone
    	$tempTimezoneAbbr = $1;
    
    	# Convert Month to number
    	if ($3 eq "Jan") {
	    	$month = "01";
    	} elsif ($3 eq "Feb") {
	    	$month = "02";
    	} elsif ($3 eq "Mar") {
	    	$month = "03";
    	} elsif ($3 eq "Apr") {
	    	$month = "04";
    	} elsif ($3 eq "May") {
	    	$month = "05";
    	} elsif ($3 eq "Jun") {
	    	$month = "06";
    	} elsif ($3 eq "Jul") {
	    	$month = "07";
    	} elsif ($3 eq "Aug") {
	    	$month = "08";
    	} elsif ($3 eq "Sep") {
	    	$month = "09";
    	} elsif ($3 eq "Oct") {
	    	$month = "10";
    	} elsif ($3 eq "Nov") {
	    	$month = "11";
    	} elsif ($3 eq "Dec") {
	    	$month = "12";
    	}
    	# Create the beginning of the ISO timestamp
    	$dateHolder = "20" . $4 . "-" . $month . "-" . $2 . "T";
    } else {
    
	    # Now look for the data lines
	    if ($_ =~ /$ctdExpr/) {
	    	# Combine the time to the date header created already to
	    	# build a complete ISO timestamp
	    	my $timestamp = $dateHolder . $1 . $tempTimezoneAbbr;

	    	# Convert to time object
	    	my $tempTimestampObject = str2time($timestamp);

	    	# Make sure it is after the last time stamp found
	    	if ($tempTimestampObject >= $currentCTDDateTime) {
	    		$currentCTDDateTime = $tempTimestampObject;
	    		$currentCTDDateTimeString = $timestamp;
	    	} else {
	    		print "CTD: Skipping line $lineCounter as time seems to have reveresed (OLD: $currentCTDDateTimeString, NEW: $timestamp)\n";
	    		next;
	    	}
	    	
	    	# The second argument is the list of variables, split them
	    	# into an array for processing
	    	my @variables = split(/,/,$2);
	    	
	    	# Now print them with the date and time
	    	print FILEOUT $timestamp;
	    	
	    	# Keep track of which variable we are on
	    	my $tempVarCounter = 0;
	    	
	    	# Loop over each variable in the line
	    	foreach my $tempVar (@variables) {
	    	
	    		# Open a file for the specific variable
	    		open VAR_FILE, ">>../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/" . $ctdVarFiles[$tempVarCounter] . ".tmp";
	    		
	    		# Now parse for just the numbers
	    		if ($tempVar =~ /\s*(-*\d+\.*\d*)\D*/) {
	    			# Print to the full data file
	    			print FILEOUT "," . $1;
	    			# Print to the individual file
	    			print VAR_FILE $timestamp . "," . $1 . "\n";
	    		}
	    		
	    		# Close the variable file
	    		close VAR_FILE;
	    		
	    		# Bump the counter
	    		$tempVarCounter++;
	    	}
	    	print FILEOUT "\n";
	    }
	    
	    # Now look for the data lines for Can data
	    if ($_ !~ />$/ && $_ =~ /$canExpr/) {
	    	# Combine the time to the date header created already to
	    	# build a complete ISO timestamp
	    	my $timestamp = $dateHolder . $1 . $tempTimezoneAbbr;
	    	
	    	# Convert to time object
	    	my $tempTimestampObject = str2time($timestamp);

	    	# Make sure it is after the last time stamp found
	    	if ($tempTimestampObject >= $currentCanDateTime) {
	    		$currentCanDateTime = $tempTimestampObject;
	    		$currentCanDateTimeString = $timestamp;
	    	} else {
	    		print "Can: Skipping line $lineCounter as time seems to have reveresed (OLD: $currentCanDateTimeString, NEW: $timestamp)\n";
	    		next;
	    	}
	    	
	    	# The second argument is the list of variables, split them
	    	# into an array for processing
	    	my @variables = split(/,/,$2);
	    	
	    	# Keep track of which variable we are on
	    	my $tempVarCounter = 0;
	    	
	    	# Now print them with the date and time
	    	print FILECANOUT $timestamp;
	    	foreach my $tempVar (@variables) {
	    		# Open a file for the specific variable
	    		open VAR_FILE, ">>../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/" . $canVarFiles[$tempVarCounter] . ".tmp";
	    		
	    		if ($tempVar =~ /\s*(-*\d+\.*\d*)\D*/) {
	    			print FILECANOUT "," . $1;
	    			# Print to the individual file
	    			print VAR_FILE $timestamp . "," . $1 . "\n";
	    		}
	    		# Close the variable file
	    		close VAR_FILE;
	    		
	    		# Bump the counter
	    		$tempVarCounter++;
	    	}
	    	print FILECANOUT "\n";
	    }
    }
}

# Now we need to move all the .tmp files to their real names
foreach my $ctdVarFileToRename (@ctdVarFiles) {
	move "../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/" . $ctdVarFileToRename . ".tmp", "../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/" . $ctdVarFileToRename;	
}
foreach my $canVarFileToRename (@canVarFiles) {
	move "../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/" . $canVarFileToRename . ".tmp", "../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/" . $canVarFileToRename;	
}
move "../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/ctd.csv.tmp", "../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/ctd.csv";
move "../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/can.csv.tmp", "../../instances/" . $machine . "/deployments/" . $deployment . "/data/processed/can.csv";	

close FILE;
close FILEOUT;
close FILECANOUT;
