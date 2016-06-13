import os
import re

def parse_directory(directory):
    """
    Parses all delimited files in a specific directory

    Args:
        path: The directory that is to be parsed recursively
    Returns:
        None
    """
    # Grab a directory list
    dirlist = os.listdir(directory)

    # Loop over the files in the directory
    for file in dirlist:
        print(file)

        # Check to see if the file is a CSV or TSV extension
        if (file.endswith(".csv") or file.endswith(".tsv")):
            info = parse_file_info(directory + "/" + file)
            parse_file(directory + "/" + file, info)
        else :
            print("Not a delimited file")

def parse_file_info(path):
    """
    This method makes a pass over a file and extracts information about the file that will be used for later parsing

    Args:
        path: Path to the file being read
    Returns:
        A dictionary with information about the file
    """
    # Open the file
    file = open(path, mode='r')

    # This is the dictionary that will be populated and returned
    info = {}

    # Add a columns key
    info['columns'] = {}

    # Construct some patterns for pulling information from files
    var_pattern = '# name (\d+) = (\S+):\s+([^\[]+)\[*([^\]]+)'

    # Read the file line by line
    for line in file:
        # Search for the pattern looking for column information in Seabird CTD files
        m = re.search(var_pattern,line)

        # Check for a match
        if (m):
            print(line)
            # Add the variable name
            info['columns'][m.group(1)] = {
                'name':m.group(2).rstrip().lstrip()
            }

            # If the long variable name was found
            if (m.group(3)):
                info['columns'][m.group(1)]['varLongName'] = m.group(3).rstrip().lstrip()

            # If units were found, add those
            if (m.group(4)):
                info['columns'][m.group(1)]['units'] = m.group(4).rstrip().lstrip()

            print(info)

    return info

def parse_file(path, info):
    """
    This function parses a file
    Args:
        path: The file to parse
        info: A dictionary containing information about the file
    Returns:
        None
    """
    # Open the file for reading
    file = open(path,mode='r')

    # Read it line by line
    for line in file:
        if (not line.startswith("*") and not line.startswith("#")):
            columns = line.split()
            print(columns)

if __name__ == '__main__':
    parse_directory('/Users/kgomes/Documents/Projects/ESP/builds/esp-apps/src/test/data/Waldo/2016 So Cal/uploads/delimited')