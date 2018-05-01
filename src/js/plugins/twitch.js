// ==========================================================================
// Facebook plugin
// ==========================================================================

import utils from './../utils';
import controls from './../controls';
import ui from './../ui';

const twitch = {
    setup() {
        // Add embed class for responsive
        utils.toggleClass(this.elements.wrapper, this.config.classNames.embed, true);

        // Set aspect ratio
        twitch.setAspectRatio.call(this);

        // Setup API
        if (utils.is.object(window.Twitch) && utils.is.function(window.Twitch.Player)) {
            twitch.ready.call(this);
        } else {
            // Load the API
            utils.loadScript(this.config.urls.twitch.api).catch(error => {
                this.debug.warn('Twitch API failed to load', error);
            });
            // Load the API
            utils.loadScript(this.config.urls.twitch.api);
            const interval = window.setInterval(() => {
                if (window.Twitch) {
                    window.clearInterval(interval);
                    twitch.ready.call(this);
                }
            }, 100);
        }
    },

    // API ready
    ready() {
        const player = this;

        // Get the source URL or ID
        let source = player.media.getAttribute('src');

        // Get from <div> if needed
        if (utils.is.empty(source)) {
            source = player.media.getAttribute(this.config.attributes.embed.id);
        }

        const opts = {
            autoplay: player.config.autoplay,
            muted: player.config.muted,
        };

        // Parse whether video, channel or collection
        // then assign it to opts accordingly
        const videoId = twitch.parseTwitchId(source);
        opts[videoId.type] = videoId.src;

        const id = utils.generateId(player.provider);

        // This was taken from youtube.js
        const container = utils.createElement('div', { id });
        player.media = utils.replaceElement(container, player.media);

        player.embed = new window.Twitch.Player(id, opts);

        // Get the instance
        const instance = player.embed;
        instance.plyrProps = {
            videoId,
        };

        instance.addEventListener(window.Twitch.Player.READY, () => {
            // TODO: Get the title

            // Create a faux HTML5 API using the YouTube API
            player.media.play = () => {
                instance.play();
            };

            player.media.pause = () => {
                instance.pause();
            };

            player.media.stop = () => {
                player.pause();
                player.currentTime = 0;
            };

            // XXX: instance.getDuration() is 0 for some reason
            // Despite the API reporting that it's ready to be used
            // Live streams thankfully respond with a duration of Infinity
            // Therefore, we should be OK using the condition of !== 0 && !isNan()
            player.media.duration = 0;
            const durationInterval = setInterval(() => {
                const duration = instance.getDuration();
                if (duration !== 0 && !isNaN(duration)) {
                    if (instance.plyrProps.type !== 'channel' && duration === Infinity) {
                        // Only channels are allowed to have an infinite duration
                        return;
                    }
                    clearInterval(durationInterval);
                    player.media.duration = duration;
                    player.media.paused = true;
                    utils.dispatchEvent.call(player, player.media, 'durationchange');
                }
            }, 100);

            // Seeking
            player.media.currentTime = 0;
            Object.defineProperty(player.media, 'currentTime', {
                get() {
                    return Number(instance.getCurrentTime());
                },
                set(time) {
                    // Vimeo will automatically play on seek
                    const { paused } = player.media;

                    // Set seeking flag
                    player.media.seeking = true;

                    // Trigger seeking
                    utils.dispatchEvent.call(player, player.media, 'seeking');

                    // Seek after events sent
                    instance.seek(time);

                    // Restore pause state
                    if (paused) {
                        player.pause();
                    }
                },
            });

            // Playback speed
            // Twitch does not allow changing playbackRate
            Object.defineProperty(player.media, 'playbackRate', {
                get() {
                    return 1.0;
                },
                set() {
                    // XXX: Fail silently?
                },
            });

            // Quality

            // instance.getQualities is of the format
            // [
            //  {
            //   "name": "720p60",
            //   "group": "720p60",
            //   "codecs": "avc1.4D402A,mp4a.40.2",
            //   "bitrate": 6831378,
            //   "width": 1920,
            //   "height": 1080,
            //   "framerate": 0,
            //   "isDefault": true,
            //   "bandwidth": 6831378
            //  },
            //  ...
            // ]
            // TODO: Should we calculate every time?
            Object.defineProperty(player.media, 'quality', {
                get() {
                    const qualities = instance.getQualities();
                    // instance.getQuality() always returns 'group'
                    const entry = qualities.filter(v => v.group === instance.getQuality())[0];

                    return entry && entry.height || undefined;
                },
                set(input) {
                    const qualities = instance.getQualities();
                    const quality = input;
                    // Find the entry whose 'height' equals quality
                    const entry = qualities.filter(v => v.height === quality)[0] || qualities[0];
                    instance.setQuality(entry.group);
                },
            });

            // Volume
            let { volume } = player.config;
            Object.defineProperty(player.media, 'volume', {
                get() {
                    return volume;
                },
                set(input) {
                    volume = input;
                    instance.setVolume(volume);
                    utils.dispatchEvent.call(player, player.media, 'volumechange');
                },
            });

            // Muted
            let { muted } = player.config;
            Object.defineProperty(player.media, 'muted', {
                get() {
                    return muted;
                },
                set(input) {
                    const toggle = utils.is.boolean(input) ? input : muted;
                    muted = toggle;
                    instance.setMuted(muted);
                    utils.dispatchEvent.call(player, player.media, 'volumechange');
                },
            });

            let { currentSrc } = player.media;
            currentSrc = source;
            // Source
            Object.defineProperty(player.media, 'currentSrc', {
                get() {
                    return currentSrc;
                },
            });

            // Ended
            Object.defineProperty(player.media, 'ended', {
                get() {
                    return player.currentTime === player.duration;
                },
            });

            // Get available speeds
            player.options.speed = [];

            // Set the tabindex to avoid focus entering iframe
            if (player.supported.ui) {
                player.media.setAttribute('tabindex', -1);
            }

            utils.dispatchEvent.call(player, player.media, 'timeupdate');
            utils.dispatchEvent.call(player, player.media, 'durationchange');

            // Rebuild UI
            setTimeout(() => ui.build.call(player), 50);

            instance.addEventListener(window.Twitch.Player.ENDED, () => {
                if(player.config.loop.active) {
                    instance.seek(0);
                    instance.play();
                    return;
                }
                player.media.paused = true;
                utils.dispatchEvent.call(player, player.media, 'ended');
            });

            instance.addEventListener(window.Twitch.Player.PLAY, () => {
                player.media.paused = false;
                player.media.seeking = false;

                utils.dispatchEvent.call(player, player.media, 'play');
                utils.dispatchEvent.call(player, player.media, 'playing');

                // Poll to get playback progress
                player.timers.playing = window.setInterval(() => {
                    utils.dispatchEvent.call(player, player.media, 'timeupdate');
                }, 50);

                // Get quality
                controls.setQualityMenu.call(player, instance.getQualities().map(v => v.height));
            });

            instance.addEventListener(window.Twitch.Player.PAUSE, () => {
                player.media.paused = true;
                utils.dispatchEvent.call(player, player.media, 'pause');
            });
        });
    },
    // FIXME: Using Vimeo's code for now
    setAspectRatio(input) {
        const ratio = utils.is.string(input) ? input.split(':') : this.config.ratio.split(':');
        const padding = 100 / ratio[0] * ratio[1];
        this.elements.wrapper.style.paddingBottom = `${padding}%`;

        if (this.supported.ui) {
            const height = 240;
            const offset = (height - padding) / (height / 50);

            this.media.style.transform = `translateY(-${offset}%)`;
        }
    },
    parseTwitchId(source) {
        // By default, we treat things as videos
        // If it contains a prefix of 'channel:', 'video:', 'collection:'
        // then it's treated accordingly
        const colonIndex = source.indexOf(':');
        const hasPrefix =  colonIndex !== -1;
        if (hasPrefix) {
            const idType = source.substr(0, colonIndex);
            const id = source.substr(colonIndex + 1);
            return {
                type: idType,
                src: id,
            };
        }
        return {
            type: 'video',
            src: source,
        };
    },
};

export default twitch;
