// Grab the path library to help with directory paths
var path = require('path');

// Now export the configuration object
module.exports = {

    // This is the location where the data for all the ESPs will be stored
    dataDir: '/Users/kgomes/Documents/Web/esp/services/espweb/data',

    // Options for the data crawling service
    crawlerOptions: {
        ftpSyncIntervalMillis: 60000,
        loggerLevel: 'info'
    },

    // Options for the server
    serverOptions: {
        loggerLevel: 'info'
    },

    // Application server options
    appServerOptions: {
        hostBaseUrl: 'http://localhost',
        port: 8081,
        loggerLevel: 'info',
        // The UserRouter options
        userRouterOptions: {
            loggerLevel: 'info'
        },
        // The ESPRouter options
        espRouterOptions: {
            loggerLevel: 'info'
        },
        // The DeploymentRouter options
        deploymentRouterOptions: {
            loggerLevel: 'info'
        },
        // The AncillaryDataRouter options
        ancillaryDataRouterOptions: {
            loggerLevel: 'info'
        }
    },


    // Datastore connection options
    dataStoreOptions: {
        couchHost: 'localhost',
        couchPort: 5984,
        couchSSL: false,
        couchUsername: 'espdba',
        couchPassword: 'leghorn',
        couchDatabase: 'esp',
        pgProtocol: 'postgres',
        pgHost: 'localhost',
        pgPort: 5432,
        pgUsername: 'espdba',
        pgPassword: 'leghorn',
        pgDatabase: 'esp_ancillary',
        loggerLevel: 'debug',
        numAncillaryPointsToBatch: 1000
    },

    // The options for the FTPSync class
    deploymentFileSyncOptions: {
        loggerLevel: 'debug'
    },

    // The LogParser options
    logParserOptions: {
        loggerLevel: 'debug',
        useAncillaryTimestamps: true,
        numberOfTicksPerSecond: 100,
        tempDir: '/tmp',
        numberOfAncillaryRecordsToBatch: 1000,
        // The timezone lookup table
        timezoneLookup: {
            'EDT': {
                stringRep: '-0400',
                hourOffset: -4
            },
            'GMT': {
                stringRep: '0000',
                hourOffset: 0
            },
            'PDT': {
                stringRep: '-0700',
                hourOffset: -7
            },
            'PST': {
                stringRep: '-0800',
                hourOffset: -8
            },
            'UTC': {
                stringRep: '0000',
                hourOffset: 0
            }
        },
        // The ancillary data lookup table
        ancillaryLookup: {
            CTD: {
                'C': {
                    varName: 'Temp',
                    varLongName: 'Temperature',
                    units: 'Degrees C'
                },
                'm': {
                    varName: 'Depth',
                    varLongName: 'Depth',
                    units: 'meters'
                },
                'psu': {
                    varName: 'Sal',
                    varLongName: 'Salinity',
                    units: 'psu'
                },
                'mg/m^3': {
                    varName: 'Chl',
                    varLongName: 'Chlorophyll',
                    units: 'mg/m^3'
                },
                '%': {
                    varName: 'Light Tx',
                    varLongName: 'Light Transmission',
                    units: '%'
                },
                'ml/L': {
                    varName: 'Diss O2',
                    varLongName: 'Computed Dissolved Oxygen',
                    units: 'ml/L'
                },
                'decibars': {
                    varName: 'Press',
                    varLongName: 'Pressure',
                    units: 'decibars'
                },
                'S/m': {
                    varName: 'Cond',
                    varLongName: 'Conductivity',
                    units: 'S/m'
                }
            },
            Can: {
                'C': {
                    varName: 'Temp',
                    varLongName: 'Temperature',
                    units: 'Degrees C'
                },
                '% humidity': {
                    varName: '% Humidity',
                    varLongName: 'Percent Humidity',
                    units: '%'
                },
                'psia': {
                    varName: 'Press',
                    varLongName: 'Pressure',
                    units: 'psia'
                },
                'V': {
                    varName: 'Volt',
                    varLongName: 'Battery Voltage',
                    units: 'V'
                },
                'A': {
                    varName: 'Inst Curr',
                    varLongName: 'Instantaneous Current',
                    units: 'A'
                },
                'A avg': {
                    varName: 'Avg Curr',
                    varLongName: 'Average Current',
                    units: 'A'
                },
                'W': {
                    varName: 'Power',
                    varLongName: 'Power',
                    units: 'W'
                }
            },
            ISUS: {
                'uM/L no^3': {
                    varName: 'Nitrate',
                    varLongName: 'Nitrate',
                    units: 'uM/L no^3'
                },
                'uM/L hs': {
                    varName: 'Nitrate 2',
                    varLongName: 'Nitrate 2',
                    units: 'uM/L hs'
                },
                'psu': {
                    varName: 'PSU',
                    varLongName: 'PSU',
                    units: 'psu'
                }
            },
            SatlanticISUS: {
                'uM/L': {
                    varName: 'Nitrate',
                    varLongName: 'Nitrate',
                    units: 'uM/L'
                },
                'psu': {
                    varName: 'PSU',
                    varLongName: 'PSU',
                    units: 'psu'
                }
            }
        }
    },

    // The EventHandler options
    eventHandlerOptions: {
        loggerLevel: 'info'
    }
};
