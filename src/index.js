/**
 * A wrapper over a DOM Element with method for easily adjusting the height of
 * it through a range between 0 and a maximum.
 */
class ScalableHeightElement {
    #element;
    #maxHeightPx;

    /**
     * @param {HTMLElement} element The element whose height needs to be varies
     * @param {number} maxHeightPx The maximum height the element can take in px
     */
    constructor(element, maxHeightPx) {
        this.#maxHeightPx = maxHeightPx;
        this.#element = element;
    }

    /**
     * Given a value between 0 and 1, sets the height of the HTMLElement to a
     * scaled value between 0 and maximum height
     */
    set height(newValue) {
        this.#element.style.height = `${newValue * this.#maxHeightPx}px`;
    }
}

/**
 * Consumes the samples produced by the sample consumer. Each sample is the
 * amplitude of the audio at a given point of time. Each sample corresponds to
 * one bar in the visual at a given time.
 * 
 * This implementation of the sample consumer maintains a sliding window of
 * received samples and updates the values as height of a set of "bars"
 */
class SampleConsumer {
    #bars;
    #samples;

    /**
     * @param {ScalableHeightElement[]} bars An array of height adjustable bars
     */
    constructor(bars) {
        this.#bars = bars;
        this.#samples = new Array(bars.length).fill(0);
    }

    /**
     * When a new sample is consumed, removes the oldest sample and pushes the
     * provided sample. Also updates the heights of all corresponding bars.
     * @param {number} value The sample amplitude value
     */
    consumeSample(value) {
        this.#samples.shift();
        this.#samples.push(value);

        this.#samples.forEach((value, index) => this.#bars[index].height = value);
    }
}

/**
 * Takes a <audio> element and produces amplitude samples at periodic intervals
 * of time (it is guaranteed that a given number of samples will be generated
 * between any two points of time, but the samples may not be evenly spaced out,
 * it is done in a best effort basis)
 */
class SampleProducer {
    #audio;
    #context;

    #consumer;
    #sampleIntervalMs;
    #delayMs;

    #audioNode;
    #delayNode;
    #analyserNode;

    #dataArray;
    #previousSampleProducedAt = 0;

    /**
     * @param {HTMLAudioElement} audio The <audio> element
     * @param {object} options
     * @param {SampleConsumer} consumer The consumer to which samples will be sent
     * @param {number} options.sampleIntervalMs The interval in ms to produce consecutive sample
     * @param {number} [options.delayMs] Optional overall delay in ms to produce sample
     */
    constructor(audio, consumer, { sampleIntervalMs, delayMs = 0.1 }) {
        this.#audio = audio;
        this.#consumer = consumer;
        this.#sampleIntervalMs = sampleIntervalMs;
        this.#delayMs = delayMs;

        this.#audio.addEventListener('play', () => this.#initialize(), { once: true });
    }

    #createNodes() {
        this.#context = new AudioContext();
        this.#audioNode = this.#context.createMediaElementSource(this.#audio);
        this.#analyserNode = this.#context.createAnalyser();

        const delaySeconds = this.#delayMs / 1000;
        this.#delayNode = this.#context.createDelay(delaySeconds);
        this.#delayNode.delayTime.value = delaySeconds;

        this.#analyserNode.fftSize = 4096;
        this.#dataArray = new Float32Array(this.#analyserNode.fftSize);
    }

    #connectNodes() {
        this.#audioNode.connect(this.#analyserNode);
        this.#analyserNode.connect(this.#delayNode);
        this.#delayNode.connect(this.#context.destination);
    }

    #initialize() {
        this.#createNodes();
        this.#connectNodes();
        this.#scheduleTick();
    }

    #scheduleTick() {
        requestAnimationFrame(timestamp => this.#tick(timestamp));
    }

    /**
     * Callback invoked by requestAnimationFrame.
     * Gets the current audio time domain data, computes it's average and
     * produce the expected number of samples by invoking consumeSample on the
     * consumer this producer is associated with.
     */
    #tick(currentTimestamp) {
        this.#scheduleTick();

        if (this.#previousSampleProducedAt == 0) {
            // This is the first time animation is happening, just record
            // the time and exit
            this.#previousSampleProducedAt = currentTimestamp;
            return;
        }

        const timeElapsed = currentTimestamp - this.#previousSampleProducedAt;

        this.#analyserNode.getFloatTimeDomainData(this.#dataArray);
        const sampleValue = this.#getOverallAmplitude(this.#dataArray);

        const sampleCount = Math.floor(timeElapsed / this.#sampleIntervalMs);
        this.#previousSampleProducedAt += sampleCount * this.#sampleIntervalMs;

        for (let i = 0; i < sampleCount; i++) {
            this.#consumer.consumeSample(sampleValue);
        }
    }

    /**
     * Given an array, returns an average of the absolutes of all elements
     */
    #getOverallAmplitude(array) {
        return array.reduce((acc, e) => acc + Math.abs(e)) / array.length;
    }
}

const MAX_BAR_HEIGHT_PX = 200;
const bars = [...document.querySelectorAll('.bar')].map(e => new ScalableHeightElement(e, MAX_BAR_HEIGHT_PX));

const songTempoBpm = 150;
const beatIntervalMs = 60 * 1000 / songTempoBpm;
const sampleIntervalMs = beatIntervalMs / bars.length;

const sampleConsumer = new SampleConsumer(bars);

const audio = document.getElementById('audio');
const sampleProducer = new SampleProducer(audio, sampleConsumer, {
    sampleIntervalMs,
    delayMs: beatIntervalMs
});
