import utils from './../utils';
import Console from './../console';

const googleCast = {
    setup(config) {
        googleCast.defaults = {};
        googleCast.config = {};

        googleCast.events = {
            'ready': googleCast.onReady,
            'play': googleCast.onPlay,
            'pause': googleCast.onPause,
            'seeked': googleCast.onSeek,
            'volumechange': googleCast.onVolumeChange,
            'qualityrequested': googleCast.onQualityChange,
        };

        googleCast.debug = new Console(true);
        // TODO: Get cast logs under a separate namespace?

        // Inject the container
        if (!utils.is.element(this.elements.googlecast)) {
            this.elements.googlecast = utils.createElement(
                'div',
                utils.getAttributesFromSelector(this.config.selectors.googlecast)
            );
            utils.insertAfter(this.elements.googlecast, this.elements.wrapper);
        }
        // Set the class hook
        utils.toggleClass(this.elements.container, this.config.classNames.googlecast.enabled, true);

        if (!window.chrome.cast) {
            utils.loadScript(this.config.urls.googleCast.api).then(() => {
                // FIXME: There __has__ to be a better way to do this
                // window.chrome.cast isn't immediately available when this function runs
                const interval = setInterval(() => {
                    if (window.chrome.cast.isAvailable) {
                        clearInterval(interval);
                        googleCast.defaults = {
                            options: {
                                receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                                autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
                            },
                        };
                        const opts = utils.extend({}, googleCast.defaults, config);
                        googleCast.initializeCastApi(opts);
                    }
                }, 100);
            });
        }
    },

    initializeCastApi(config) {
        const { framework } = window.cast;
        const { CastContext } = framework;
        CastContext.getInstance().setOptions(config.options);

        // Set up event handlers
        CastContext
            .getInstance()
            .addEventListener(
                framework.CastContextEventType.CAST_STATE_CHANGED,
                googleCast.castStateListener
            );
        CastContext
            .getInstance()
            .addEventListener(
                framework.CastContextEventType.SESSION_STATE_CHANGED,
                googleCast.sessionStateListener
            );
        googleCast.debug.log('Initialized google cast');
    },

    getCurrentSession() {
        return window.cast.framework.CastContext.getInstance().getCurrentSession();
    },

    getCurrentPlyr() {
        return googleCast.currentPlyr;
    },

    onPlay() {
        const plyr = googleCast.getCurrentPlyr();
        googleCast.debug.log('Asking remote player to play');
        // Seek before playing?
        // googleCast.onSeek();
        plyr.remotePlayerController.playOrPause();
    },
    onPause() {
        const plyr = googleCast.getCurrentPlyr();
        googleCast.debug.log('Asking remote player to pause');
        plyr.remotePlayerController.playOrPause();
        // Seek after pause
        googleCast.onSeek();
    },
    onSeek() {
        const plyr = googleCast.getCurrentPlyr();
        const timestamp = plyr.currentTime;
        plyr.remotePlayer.currentTime = timestamp;
        plyr.remotePlayerController.seek();
        googleCast.debug.log(`Asking remote player to seek to ${timestamp}`);
    },
    onReady() {
        googleCast.debug.log('Running googleCast.onReady()');
        const plyr = googleCast.getCurrentPlyr();
        googleCast.loadMedia(plyr);
    },
    onVolumeChange() {
        const plyr = googleCast.getCurrentPlyr();
        // We need to specially handle the case where plyr is muted
        let { volume } = plyr;
        if (plyr.muted) {
            volume = 0;
        }
        plyr.remotePlayer.volumeLevel = volume;
        plyr.remotePlayerController.setVolumeLevel();
    },
    onQualityChange() {
        const plyr = googleCast.getCurrentPlyr();
        googleCast.loadMedia(plyr);
    },
    loadMedia(plyr) {
        googleCast.debug.log('load media called');
        const session = googleCast.getCurrentSession();
        if (!session) {
            return;
        }

        // TODO: We need to be able to override the defaults
        const defaults = {
            mediaInfo: {
                source: plyr.source,
                type: 'video/mp4',
            },
            metadata: {
                metadataType: window.chrome.cast.media.MetadataType.GENERIC,
                title: plyr.config.title || plyr.source,
                images: [{
                    url: plyr.poster,
                }],
            },
            loadRequest: {
                autoplay: plyr.playing,
                currentTime: plyr.currentTime,
            },
        };
        const options = utils.extend({}, defaults);

        const mediaInfo = new window.chrome.cast.media.MediaInfo(options.mediaInfo.source, options.mediaInfo.type);
        mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
        Object.assign(mediaInfo.metadata, options.metadata);

        const loadRequest = new window.chrome.cast.media.LoadRequest(mediaInfo);
        loadRequest.autoplay = options.loadRequest.autoplay;
        loadRequest.currentTime = options.loadRequest.currentTime;
        session.loadMedia(loadRequest).then(
            () => {
                googleCast.debug.log('Successfully loaded media');
                googleCast.bindPlyr(plyr);
            },
            errorCode => {
                googleCast.debug.log(`Remote media load error: ${googleCast.getErrorMessage(errorCode)}`);
            }
        );
    },
    setCurrentPlyr(plyr) {
        googleCast.currentPlyr = plyr;
    },
    bindPlyr(plyr, options) {
        if (googleCast.currentPlyr !== plyr) {
            googleCast.debug.warn('Warning! Current plyr !==  plyr in bindPlyr()');
            googleCast.currentPlyr = plyr;
        }
        googleCast.currentPlyrOptions = options;

        // TODO: Figure out if we should do plyr.remotePlayer = plyr.remotePlayer || new window.cast.framework.RemotePlayer()
        plyr.remotePlayer = new window.cast.framework.RemotePlayer();
        // TODO: Figure out if we should do plyr.remotePlayerController = plyr.remotePlayerController || new window.cast.framework.RemotePlayerController(plyr.remotePlayer);
        plyr.remotePlayerController = new window.cast.framework.RemotePlayerController(plyr.remotePlayer);

        // Iterate over events and add all listeners
        Object.keys(googleCast.events).forEach((evt) => {
            const fn = googleCast.events[evt];
            plyr.on(evt, fn);
        });
        googleCast.debug.log('Plyr bound');
    },

    unbindPlyr(plyr) {
        const { currentPlyr } = googleCast;
        if (currentPlyr === plyr) {
            Object.keys(googleCast.events).forEach((evt) => {
                const fn = googleCast.events[evt];
                plyr.off(evt, fn);
            });
        }
        googleCast.currentPlyr = undefined;
        googleCast.currentPlyrOptions = undefined;
    },

    getErrorMessage(error) {
        const { chrome } = window;
        switch (error.code) {
            case chrome.cast.ErrorCode.API_NOT_INITIALIZED:
                return `The API is not initialized.${error.description ? ` :${error.description}` : ''}`;
            case chrome.cast.ErrorCode.CANCEL:
                return `The operation was canceled by the user${error.description ? ` :${error.description}` : ''}`;
            case chrome.cast.ErrorCode.CHANNEL_ERROR:
                return `A channel to the receiver is not available.${error.description
                    ? ` :${error.description}`
                    : ''}`;
            case chrome.cast.ErrorCode.EXTENSION_MISSING:
                return `The Cast extension is not available.${error.description ? ` :${error.description}` : ''}`;
            case chrome.cast.ErrorCode.INVALID_PARAMETER:
                return `The parameters to the operation were not valid.${error.description
                    ? ` :${error.description}`
                    : ''}`;
            case chrome.cast.ErrorCode.RECEIVER_UNAVAILABLE:
                return `No receiver was compatible with the session request.${error.description
                    ? ` :${error.description}`
                    : ''}`;
            case chrome.cast.ErrorCode.SESSION_ERROR:
                return `A session could not be created, or a session was invalid.${error.description
                    ? ` :${error.description}`
                    : ''}`;
            case chrome.cast.ErrorCode.TIMEOUT:
                return `The operation timed out.${error.description ? ` :${error.description}` : ''}`;
            default:
                return `Unknown error: ${JSON.stringify(error)}`;
        }
    },

    castStateListener(data) {
        googleCast.debug.log(`Cast State Changed: ${JSON.stringify(data)}`);
        const plyr = googleCast.getCurrentPlyr();
        const cs = window.cast.framework.CastState;
        let castEvent;
        switch (data.castState) {
            case cs.NO_DEVICES_AVAILABLE:
            case cs.NOT_CONNECTED:
                googleCast.debug.log('NOT CONNECTED');
                castEvent = 'castdisabled';
                break;
            case cs.CONNECTING:
                break;
            case cs.CONNECTED:
                castEvent = 'castenabled';
                break;
            default:
                // googleCast.debug.log(`Unknown cast state=${JSON.stringify(data.castState)}`);
                break;
        }
        if (plyr && castEvent) {
            const castActive = castEvent === 'castenabled';
            // Add class hook
            utils.toggleClass(plyr.elements.container, plyr.config.classNames.googlecast.active, castActive);
            utils.dispatchEvent.call(plyr, plyr.elements.container, castEvent, true);
        }
    },

    sessionStateListener(data) {
        const plyr = googleCast.getCurrentPlyr();
        if (!plyr) {
            return;
        }
        // console.log("Session State Changed: " + JSON.stringify(data));
        const ss = window.cast.framework.SessionState;

        switch (data.sessionState) {
            case ss.NO_SESSION:
                break;
            case ss.SESSION_STARTING:
                break;
            case ss.SESSION_STARTED:
            case ss.SESSION_RESUMED:
                // run on ready
                googleCast.onReady();
                break;
            case ss.SESSION_START_FAILED:
            case ss.SESSION_ENDED:
                break;
            case ss.SESSION_ENDING:
                break;
            default:
                // plyr.log(`Unknown session state=${JSON.stringify(data.sessionState)}`);
                break;
        }
        googleCast.debug.log(`sessionStateListener: state=${data.sessionState}`);
    },

    requestSession(plyr) {
        // Check if a session already exists, if it does, just use it
        const session = googleCast.getCurrentSession();

        let wasPlyrAlreadyBound = true;
        const existingPlyr = googleCast.getCurrentPlyr();
        if (existingPlyr !== undefined && existingPlyr !== plyr) {
            googleCast.unbindPlyr(existingPlyr);
        }
        if (existingPlyr !== plyr) {
            googleCast.setCurrentPlyr(plyr);
            wasPlyrAlreadyBound = false;
        }

        function onRequestSuccess(e) {
            // This only triggers when a new session is created.
            // It does not trigger on successfully showing the drop down and
            // requesting stop session.
        }

        function onError(e) {
            googleCast.unbindPlyr(googleCast.getCurrentPlyr());
        }

        // We need to show the cast drop down if:
        // 1) There was no session
        // 2) There was a session and the current plyr was already bound
        //
        // (2) is needed since we need a way to disable cast via the current
        // plyr instance
        if (session === null || wasPlyrAlreadyBound) {
            const promise = window.cast.framework.CastContext.getInstance().requestSession();
            promise.then(onRequestSuccess, onError);
        } else {
            // We have a session and we're just looking to bind plyr which we've
            // done already. Just load media and change icon based on session state.
            const cs = window.cast.framework.CastContext.getInstance().getCastState();
            const castStateEventData = new window.cast.framework.CastStateEventData(cs);
            googleCast.castStateListener(castStateEventData);

            const ss = window.cast.framework.CastContext.getInstance().getSessionState();
            const sessionStateEventData = new window.cast.framework.SessionStateEventData(session, ss, 0);
            googleCast.sessionStateListener(sessionStateEventData);
        }
    },

    // Display cast container and button (for initialization)
    show() {
        // If there's no cast toggle, bail
        if (!this.elements.buttons.googlecast) {
            return;
        }

        // Try to load the value from storage
        let active = this.storage.googlecast;

        // Otherwise fall back to the default config
        if (!utils.is.boolean(active)) {
            ({ active } = this.googlecast);
        } else {
            this.googlecast.active = active;
        }

        if (active) {
            utils.toggleClass(this.elements.container, this.config.classNames.googlecast.active, true);
            utils.toggleState(this.elements.buttons.googlecast, true);
        }
    },
};
export default googleCast;
