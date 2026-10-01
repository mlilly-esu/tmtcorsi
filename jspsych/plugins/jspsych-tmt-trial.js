/*
 * jspsych-tmt-trial.js
 *
 * Custom jsPsych 6.1 plugin for a click-based Trail Making Test trial.
 * Draws a set of labeled circles at random (non-overlapping) positions
 * on a canvas. The participant clicks the circles in the order given
 * by `labels`. A green line is drawn connecting each circle to the
 * next once clicked correctly. Clicking the wrong circle counts as
 * an error but does not end the trial. The trial ends when every
 * circle has been clicked in order, or when trial_duration elapses.
 *
 * Data recorded:
 *   completed      - true if the participant finished the sequence,
 *                    false if the trial timed out
 *   total_time_ms  - time from stimulus onset to completion/timeout
 *   errors         - number of clicks on a circle out of sequence
 *   num_targets    - number of circles in this trial
 *   click_log      - JSON string with a full clickable-by-click record
 */
jsPsych.plugins["tmt-trial"] = (function () {

    var plugin = {};

    plugin.info = {
        name: "tmt-trial",
        parameters: {
            labels: {
                type: jsPsych.plugins.parameterType.STRING,
                array: true,
                pretty_name: "Labels",
                default: undefined,
                description: "Ordered list of labels the participant must click in sequence (e.g. ['1','2','3'] or ['1','A','2','B'])."
            },
            circle_radius: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Circle radius",
                default: 26
            },
            min_distance: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Minimum distance between circle centers",
                default: 100
            },
            canvas_width: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Canvas width",
                default: 850
            },
            canvas_height: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Canvas height",
                default: 600
            },
            trial_duration: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: "Trial duration",
                default: 300000,
                description: "Safety timeout in ms in case the participant never finishes."
            },
            data_part_label: {
                type: jsPsych.plugins.parameterType.STRING,
                pretty_name: "Part label",
                default: "A",
                description: "Which part of the test this is (used to tag the data row)."
            }
        }
    };

    plugin.trial = function (display_element, trial) {

        var radius = trial.circle_radius;
        var minDist = trial.min_distance;
        var W = trial.canvas_width;
        var H = trial.canvas_height;
        var labels = trial.labels;

        // ---- Generate random, non-overlapping circle positions ----
        var circles = [];
        var padding = radius + 20;
        for (var i = 0; i < labels.length; i++) {
            var placed = false;
            var attempts = 0;
            var x, y;
            while (!placed && attempts < 2000) {
                x = padding + Math.random() * (W - 2 * padding);
                y = padding + Math.random() * (H - 2 * padding);
                var ok = true;
                for (var j = 0; j < circles.length; j++) {
                    var dx = x - circles[j].x;
                    var dy = y - circles[j].y;
                    if (Math.sqrt(dx * dx + dy * dy) < minDist) {
                        ok = false;
                        break;
                    }
                }
                if (ok) placed = true;
                attempts++;
            }
            // Fallback: if we somehow couldn't place it after many attempts,
            // just drop it wherever the last attempt landed rather than looping forever.
            circles.push({ label: labels[i], x: x, y: y, visited: false });
        }

        // ---- Build the canvas ----
        display_element.innerHTML =
            '<canvas id="tmt-canvas" width="' + W + '" height="' + H +
            '" style="background:#ffffff;border:1px solid #e2e5ea;border-radius:14px;' +
            'box-shadow:0 4px 20px rgba(0,0,0,0.08);cursor:pointer;display:block;margin:30px auto;"></canvas>';

        var canvas = document.getElementById('tmt-canvas');
        var ctx = canvas.getContext('2d');

        var currentIndex = 0;
        var errorCount = 0;
        var segments = [];
        var clickLog = [];
        var flashCircle = null;
        var startTime = performance.now();

        function draw() {
            ctx.clearRect(0, 0, W, H);

            // completed connecting lines
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 3;
            segments.forEach(function (s) {
                ctx.beginPath();
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
                ctx.stroke();
            });

            // circles
            circles.forEach(function (c, idx) {
                ctx.beginPath();
                ctx.arc(c.x, c.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = c.visited ? '#dbeafe' : (flashCircle === idx ? '#fecaca' : '#ffffff');
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#14213d';
                ctx.stroke();
                ctx.fillStyle = '#14213d';
                ctx.font = 'bold 18px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(c.label, c.x, c.y);
            });
        }

        draw();

        function handleClick(e) {
            var rect = canvas.getBoundingClientRect();
            var clickX = e.clientX - rect.left;
            var clickY = e.clientY - rect.top;
            var now = performance.now();

            var hitIdx = -1;
            for (var i = 0; i < circles.length; i++) {
                var dx = clickX - circles[i].x;
                var dy = clickY - circles[i].y;
                if (Math.sqrt(dx * dx + dy * dy) <= radius) {
                    hitIdx = i;
                    break;
                }
            }

            if (hitIdx === -1) return; // clicked empty space; not an error

            if (hitIdx === currentIndex) {
                // correct circle
                if (currentIndex > 0) {
                    segments.push({
                        x1: circles[currentIndex - 1].x,
                        y1: circles[currentIndex - 1].y,
                        x2: circles[currentIndex].x,
                        y2: circles[currentIndex].y
                    });
                }
                circles[currentIndex].visited = true;
                clickLog.push({ label: circles[hitIdx].label, correct: true, t: Math.round(now - startTime) });
                currentIndex++;
                draw();

                if (currentIndex === circles.length) {
                    endTrial(true);
                }
            } else {
                // wrong circle
                errorCount++;
                clickLog.push({ label: circles[hitIdx].label, correct: false, t: Math.round(now - startTime) });
                flashCircle = hitIdx;
                draw();
                setTimeout(function () {
                    flashCircle = null;
                    draw();
                }, 250);
            }
        }

        canvas.addEventListener('click', handleClick);

        var timeoutId = jsPsych.pluginAPI.setTimeout(function () {
            endTrial(false);
        }, trial.trial_duration);

        function endTrial(completed) {
            canvas.removeEventListener('click', handleClick);
            jsPsych.pluginAPI.clearAllTimeouts();

            var total_time = Math.round(performance.now() - startTime);
            var trial_data = {
                part: trial.data_part_label,
                completed: completed,
                total_time_ms: total_time,
                errors: errorCount,
                num_targets: labels.length,
                click_log: JSON.stringify(clickLog)
            };

            display_element.innerHTML = '';
            jsPsych.finishTrial(trial_data);
        }
    };

    return plugin;
})();
