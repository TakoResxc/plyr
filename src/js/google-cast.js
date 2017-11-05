import utils from './utils';

const googleCast = {
    setup(config) {
        googleCast.defaults = {};
        googleCast.config = {};

        // Debugging
        googleCast.log = () => {};
        googleCast.warn = () => {};
        googleCast.error = () => {};
        if (googleCast.config.debug && 'console' in window) {
        googleCast.log = console.log; // eslint-disable-line
        googleCast.warn = console.warn; // eslint-disable-line
        googleCast.error = console.error; // eslint-disable-line
            googleCast.log('Debugging enabled');
        }

        // Inject the container
        if (!utils.is.htmlElement(this.elements.cast)) {
            this.elements.cast = utils.createElement(
                'div',
                utils.getAttributesFromSelector(this.config.selectors.cast)
            );
            utils.insertAfter(this.elements.cast, this.elements.wrapper);
        }
        // Set the class hook
        utils.toggleClass(
            this.elements.container,
            this.config.classNames.cast.enabled,
            true,
        );

        utils.loadScript('//www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1');
        // FIXME: There __has__ to be a better way to do this
        if (!window.chrome.cast || !window.chrome.cast.isAvailable) {
            setTimeout(() => {
                googleCast.defaults = {
                    options: {
                        receiverApplicationId:  window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
                    },
                };
                const opts = utils.extend({}, googleCast.defaults, config);
                googleCast.initializeCastApi(opts);
            }, 1000);
        }
    },

    initializeCastApi(config) {
        window.cast.framework.CastContext.getInstance().setOptions(config.options);

        // Set up event handlers
        window.cast.framework.CastContext.getInstance().addEventListener(window.cast.framework.CastContextEventType.CAST_STATE_CHANGED, googleCast.castStateListener);
        window.cast.framework.CastContext.getInstance().addEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, googleCast.sessionStateListener);
        googleCast.log('Initialized google cast');

    },

    getCurrentSession() {
        return window.cast.framework.CastContext.getInstance().getCurrentSession();
    },

    getCurrentPlyr() {
        const cc = window.cast.framework.CastContext.getInstance();
        let plyr;

        if(!cc) {
            return undefined;
        }
        plyr = cc.plyr;
        return plyr;
    },

    onPlay() {
        const plyr = googleCast.getCurrentPlyr();

        googleCast.log('Asking remote player to play');
        plyr.remotePlayerController.playOrPause();
    },
    onPause() {
        const plyr = googleCast.getCurrentPlyr();
        googleCast.log('Asking remote player to pause');
        plyr.remotePlayerController.playOrPause();
    },
    onReady() {
        const plyr = googleCast.getCurrentPlyr();
        googleCast.loadMedia(plyr);
    },

    loadMedia(plyr) {
        googleCast.log('load media called');
        const session = googleCast.getCurrentSession();
        if(!session) {
            return;
        }

        const defaults = {
            mediaInfo: {
                source: plyr.src,
                type: 'video/mp4',
            },
            metadata: {
                metadataType: window.chrome.cast.media.MetadataType.GENERIC,
                title: plyr.src,
                images: [{}],
            },
            loadRequest: {
                autoplay: false,
                currentTime: plyr.currentTime,
            },
        };
        let options = window.cast.framework.CastContext.getInstance().options;
        options = utils.extend({}, defaults, options);

        const mediaInfo = new window.chrome.cast.media.MediaInfo(options.mediaInfo.source, options.mediaInfo.type);
        mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.metadataType = options.metadata.metadataType;
        mediaInfo.metadata.title = options.metadata.title;
        mediaInfo.metadata.images = options.metadata.images;

        const loadRequest = new window.chrome.cast.media.LoadRequest(mediaInfo);
        loadRequest.autoplay = options.loadRequest.autoplay;
        loadRequest.currentTime = options.loadRequest.currentTime;

        session.loadMedia(loadRequest).then(
            () => {
                googleCast.log('Successfully loaded media');
            },
            (errorCode) => {
                googleCast.log(`Remote media load error: ${googleCast.getErrorMessage(errorCode)}`);
            }
        );
    },

    bindPlyr(plyr, options) {
        const cc = window.cast.framework.CastContext.getInstance();
        cc.plyr = plyr;
        cc.options = options;

        plyr.remotePlayer = new window.cast.framework.RemotePlayer();
        plyr.remotePlayerController = new window.cast.framework.RemotePlayerController(plyr.remotePlayer);

        utils.on(plyr.media, 'play', googleCast.onPlay);
        utils.on(plyr.media, 'pause', googleCast.onPause);

        plyr.on('ready', googleCast.onReady);
        googleCast.log('Plyr bound');
    },

    unbindPlyr(plyr) {
        const cc = window.cast.framework.CastContext.getInstance();
        const currentPlyr = cc.plyr;
        if(currentPlyr === plyr) {
            utils.off(currentPlyr.media, 'play', googleCast.onPlay);
            utils.off(currentPlyr.media, 'pause', googleCast.onPause);
            utils.off(currentPlyr.media, 'ready', googleCast.onReady);
        }
        cc.plyr = undefined;
    },

    getErrorMessage(error) {
        const chrome = window.chrome;
        switch (error.code) {
            case chrome.cast.ErrorCode.API_NOT_INITIALIZED:
                return `The API is not initialized.${
                    error.description ? ` :${  error.description}` : ''}`;
            case chrome.cast.ErrorCode.CANCEL:
                return `The operation was canceled by the user${
                    error.description ? ` :${  error.description}` : ''}`;
            case chrome.cast.ErrorCode.CHANNEL_ERROR:
                return `A channel to the receiver is not available.${
                    error.description ? ` :${  error.description}` : ''}`;
            case chrome.cast.ErrorCode.EXTENSION_MISSING:
                return `The Cast extension is not available.${
                    error.description ? ` :${  error.description}` : ''}`;
            case chrome.cast.ErrorCode.INVALID_PARAMETER:
                return `The parameters to the operation were not valid.${
                    error.description ? ` :${  error.description}` : ''}`;
            case chrome.cast.ErrorCode.RECEIVER_UNAVAILABLE:
                return `No receiver was compatible with the session request.${
                    error.description ? ` :${  error.description}` : ''}`;
            case chrome.cast.ErrorCode.SESSION_ERROR:
                return `A session could not be created, or a session was invalid.${
                    error.description ? ` :${  error.description}` : ''}`;
            case chrome.cast.ErrorCode.TIMEOUT:
                return `The operation timed out.${
                    error.description ? ` :${  error.description}` : ''}`;
            default:
                return `Unknown error: ${JSON.stringify(error)}`;
        }
    },

    castStateListener(data) {
        googleCast.log(`Cast State Changed: ${  JSON.stringify(data)}`);
        const plyr = googleCast.getCurrentPlyr();
        const cs = window.cast.framework.CastState;
        let castEvent;
        switch(data.castState) {
            case cs.NO_DEVICES_AVAILABLE:
            case cs.NOT_CONNECTED:
                googleCast.log('NOT CONNECTED');
                castEvent = 'castdisabled';
                break;
            case cs.CONNECTING:
                break;
            case cs.CONNECTED:
                castEvent = 'castenabled';
                break;
            default:
                // googleCast.log(`Unknown cast state=${JSON.stringify(data.castState)}`);
                break;
        }
        if(plyr && castEvent) {
            const castActive = castEvent === 'castenabled';
            // Add class hook
            utils.toggleClass(plyr.elements.container, plyr.config.classNames.cast.active, castActive);
            utils.dispatchEvent.call(plyr, plyr.elements.container, castEvent, true);
        }
    },

    sessionStateListener(data) {
        const plyr = googleCast.getCurrentPlyr();
        if(!plyr) {
            return;
        }
        // console.log("Session State Changed: " + JSON.stringify(data));
        const ss = window.cast.framework.SessionState;

        switch(data.sessionState) {
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
    },

    requestSession(plyr) {
    // Check if a session already exists, if it does, just use it
        const session = googleCast.getCurrentSession();

        let wasPlyrAlreadyBound = true;
        const existingPlyr = googleCast.getCurrentPlyr();
        if(existingPlyr !== undefined && existingPlyr !== plyr) {
            googleCast.unbindPlyr(existingPlyr);
        }
        if(existingPlyr !== plyr) {
            googleCast.bindPlyr(plyr);
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
        if(session === null || wasPlyrAlreadyBound) {
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
        if (!this.elements.buttons.cast) {
            return;
        }

        // Try to load the value from storage
        let active = this.storage.cast;

        // Otherwise fall back to the default config
        if (!utils.is.boolean(active)) {
            ({ active } = this.cast);
        } else {
            this.cast.active = active;
        }

        if (active) {
            utils.toggleClass(this.elements.container, this.config.classNames.cast.active, true);
            utils.toggleState(this.elements.buttons.cast, true);
        }
    },
};
export default googleCast;
