/*
 * jspsych-corsi-trial.js
 *
 * Custom jsPsych 6.1 plugin for one trial of the Corsi block-tapping task.
 * Draws a set of squares at random (non-overlapping) positions on a canvas,
 * highlights a random sequence of `span` distinct squares one at a time,
 * then waits for the participant to click them back in the same order.
 *
 * Data recorded per trial:
 *   span      - how many squares were in the sequence this trial
 *   correct   - true if every click matched the sequence in order
 *   sequence  - JSON array of the square indices shown, in order
 *   clicked   - JSON array of the square indices the participant clicked, in order
 */
jsPsych.plugins["corsi-trial"] = (function () {

    var plugin = {};

    plugin.info = {
        name: "corsi-trial",
        parameters: {
            span: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Span",
                default: undefined,
                description: "Number of squares in the sequence to remember."
            },
            num_items: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Number of squares",
                default: 7
            },
            item_size: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Square size",
                default: 54
            },
            min_distance: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Minimum distance between squares",
                default: 90
            },
            canvas_width: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Canvas width",
                default: 650
            },
            canvas_height: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Canvas height",
                default: 450
            },
            highlight_duration: {
                type: jsPsych.plugins.parameterType.INT,
                default: 600
            },
            inter_highlight_interval: {
                type: jsPsych.plugins.parameterType.INT,
                default: 300
            },
            pre_sequence_delay: {
                type: jsPsych.plugins.parameterType.INT,
                default: 600
            },
            response_timeout: {
                type: jsPsych.plugins.parameterType.INT,
                default: 10000
            }
        }
    };

    plugin.trial = function (display_element, trial) {

        var size = trial.item_size;
        var minDist = trial.min_distance;
        var W = trial.canvas_width;
        var H = trial.canvas_height;
        var n = trial.num_items;
        var span = trial.span;

        // ---- Generate random, non-overlapping square positions ----
        var squares = [];
        var padding = size / 2 + 20;
        for (var i = 0; i < n; i++) {
            var placed = false;
            var attempts = 0;
            var x, y;
            while (!placed && attempts < 2000) {
                x = padding + Math.random() * (W - 2 * padding);
                y = padding + Math.random() * (H - 2 * padding);
                var ok = true;
                for (var j = 0; j < squares.length; j++) {
                    var dx = x - squares[j].x;
                    var dy = y - squares[j].y;
                    if (Math.sqrt(dx * dx + dy * dy) < minDist) {
                        ok = false;
                        break;
                    }
                }
                if (ok) placed = true;
                attempts++;
            }
            squares.push({ x: x, y: y });
        }

        // ---- Pick a random sequence of `span` distinct squares ----
        var available = [];
        for (var i = 0; i < n; i++) available.push(i);
        var sequence = [];
        for (var i = 0; i < span; i++) {
            var pick = Math.floor(Math.random() * available.length);
            sequence.push(available[pick]);
            available.splice(pick, 1);
        }

        // ---- Build the canvas ----
        display_element.innerHTML =
            '<canvas id="corsi-canvas" width="' + W + '" height="' + H +
            '" style="background:#ffffff;border:1px solid #e2e5ea;border-radius:14px;' +
            'box-shadow:0 4px 20px rgba(0,0,0,0.08);display:block;margin:30px auto;"></canvas>';

        var canvas = document.getElementById('corsi-canvas');
        var ctx = canvas.getContext('2d');

        function drawSquares(highlightIdx, clickedSet) {
            ctx.clearRect(0, 0, W, H);
            squares.forEach(function (s, idx) {
                var fill = '#ffffff';
                if (highlightIdx === idx) fill = '#2563eb';
                else if (clickedSet && clickedSet.indexOf(idx) !== -1) fill = '#dbeafe';
                ctx.fillStyle = fill;
                ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#14213d';
                ctx.strokeRect(s.x - size / 2, s.y - size / 2, size, size);
            });
        }

        drawSquares(null, null);

        // ---- Play back the sequence ----
        var seqIndex = 0;
        var timeouts = [];

        function playNext() {
            if (seqIndex >= sequence.length) {
                timeouts.push(jsPsych.pluginAPI.setTimeout(startResponsePhase, trial.inter_highlight_interval));
                return;
            }
            drawSquares(sequence[seqIndex], null);
            timeouts.push(jsPsych.pluginAPI.setTimeout(function () {
                drawSquares(null, null);
                seqIndex++;
                timeouts.push(jsPsych.pluginAPI.setTimeout(playNext, trial.inter_highlight_interval));
            }, trial.highlight_duration));
        }

        timeouts.push(jsPsych.pluginAPI.setTimeout(playNext, trial.pre_sequence_delay));

        // ---- Response phase: wait for clicks in order ----
        var clicked = [];
        var responding = false;

        function startResponsePhase() {
            responding = true;
            canvas.addEventListener('click', handleClick);
            timeouts.push(jsPsych.pluginAPI.setTimeout(function () {
                if (responding) endTrial();
            }, trial.response_timeout));
        }

        function handleClick(e) {
            if (!responding) return;
            var rect = canvas.getBoundingClientRect();
            var clickX = e.clientX - rect.left;
            var clickY = e.clientY - rect.top;

            var hitIdx = -1;
            for (var i = 0; i < squares.length; i++) {
                if (Math.abs(clickX - squares[i].x) <= size / 2 && Math.abs(clickY - squares[i].y) <= size / 2) {
                    hitIdx = i;
                    break;
                }
            }
            if (hitIdx === -1) return;

            clicked.push(hitIdx);
            drawSquares(null, clicked);

            if (clicked.length >= sequence.length) {
                endTrial();
            }
        }

        function endTrial() {
            responding = false;
            canvas.removeEventListener('click', handleClick);
            jsPsych.pluginAPI.clearAllTimeouts();

            var correct = clicked.length === sequence.length &&
                clicked.every(function (v, i) { return v === sequence[i]; });

            display_element.innerHTML = '';
            jsPsych.finishTrial({
                span: span,
                correct: correct,
                sequence: JSON.stringify(sequence),
                clicked: JSON.stringify(clicked)
            });
        }
    };

    return plugin;
})();
