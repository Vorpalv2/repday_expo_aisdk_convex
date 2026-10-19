# Form Coach / Pose Coach

This document follows the Form Coach flow from the active workout entry point through camera permission, browser pose inference, repetition feedback, and cleanup. It describes the implementation currently in the repository and distinguishes browser support from the native camera placeholder.

## Entry point and exercise context

The Form button is rendered next to each exercise title in the active workout modal in `app/index.tsx`. Tapping it stores that exercise as `formCoachMove`, opens the Form Coach modal, and requests camera permission if permission has not already been granted. The camera screen receives the current exercise (including its planned sets and reps), weight unit, workout elapsed time, rest timer, permission state, and close callback.

Because the exercise is known, the coach selects movement rules using the exercise name and target muscle. This is a heuristic mapping, not a separately trained exercise classifier.

## Browser camera and data flow

On web, Expo's platform resolution loads `components/FormCoachCameraScreen.web.tsx`. Once camera permission is granted, the browser requests `navigator.mediaDevices.getUserMedia()` with video only (`audio: false`) and an ideal resolution of 960×720. The returned stream is attached to an HTML video element. Cleanup stops every media track when the screen unmounts or camera setup is repeated.

The camera frames and pose inference run in the browser. The implementation does not record the stream, upload frames/video, or persist pose landmarks or Form Coach summary statistics. The exercise's set completion still updates the active workout through the existing workout flow; only detailed pose/attempt analysis remains transient in component state.

The browser downloads the MediaPipe Tasks Vision bundle and WASM runtime from jsDelivr and the Pose Landmarker Lite model from Google Cloud Storage. The permission copy accurately notes that MediaPipe sends performance and usage metrics to Google. The video stream itself is processed locally by the browser implementation.

## Setup and model startup

After the camera preview opens, the user chooses a 5, 10, or 15 second setup countdown. Selecting a duration resets the current rep phase and counters, starts the countdown, and begins loading the model. When both countdown and model are ready, video inference starts. The page handles missing browser camera APIs, camera startup failure, missing video frames, model download or initialization failure, and canvas setup failure with an on-screen error/retry state.

The MediaPipe setup is pinned to Tasks Vision **1.1.0**, configured for video mode and one pose. Detection, presence, and tracking confidence thresholds are set to 0.55, 0.50, and 0.50. Mobile browsers initially use the CPU delegate and desktop browsers the GPU delegate; initialization retries once with the alternate delegate if the first delegate fails.

## Pose overlay and supported movement rules

MediaPipe landmarks are drawn over the camera video on a canvas. The code maps normalized landmarks to the cover-cropped camera viewport, mirrors x coordinates for the front-facing camera, and draws visible skeleton connections and points. The inference loop uses `requestAnimationFrame`, skips unchanged video frames, and limits UI/inference updates to roughly one update every 70 ms.

The current exercise mapping recognizes these movement families from the exercise name/target text:

| Movement family | Examples of name matching | Main signal |
| --- | --- | --- |
| Elbow bend | Curls, bench/chest/shoulder press, push-ups, dips, biceps/triceps terms | Shoulder–elbow–wrist angle |
| Pull-up | Pull-ups, chin-ups, and assisted variations | Shoulder–elbow–wrist angle |
| Knee bend | Squats, lunges, leg press, step-ups | Hip–knee–ankle angle |
| Leg curl/extension | Leg curls, hamstring curls, leg extensions, knee extensions | Hip–knee–ankle angle |
| Lat pulldown | Lat pulldowns and pull-down spellings | Arm position relative to shoulder/torso and elbow angle |
| Row | Rows and rowing | Elbow angle and wrist reach relative to shoulder/hip distance |
| Hip hinge | Deadlifts and Romanian deadlifts/RDLs | Knee–hip–shoulder angle |
| Calf raise | Calf/heel raises and calf press | Ankle lift relative to heel-to-toe length |
| Lateral raise | Lateral raises and side raises, including dumbbell/cable/machine names | Upper-arm angle relative to torso |
| Fly | Cable/chest fly variations, fly/flyes/flys, pec deck, butterfly, cable crossover | Distance between wrists, normalized by shoulder width |
| Pullover | Pullover/pull-over names, including triceps pullovers | Angle between upper arm and torso at the shoulder |
| Unsupported | Anything not matched | Pose overlay only; no rep-count rule |

For elbow and knee angles, the screen chooses the more visible side and requires the three landmarks to have at least 0.48 visibility/presence. A low-pass smoothing step reduces jitter. Lat pulldown and row zones additionally require visible shoulder, elbow, wrist, and hip landmarks. Their thresholds are relative to torso length, making the zone less dependent on apparent camera scale.

Deadlift/RDL zones use the knee–hip–shoulder angle, so the phone should be side-on and the shoulder, hip, and knee should remain visible. Leg curls and extensions share the knee-angle rep counter with squats and leg presses; they are matched explicitly by exercise name. Calf raises use the vertical gap between the ankle and toe landmarks divided by heel-to-toe length. The user needs a side view with visible foot landmarks. These heuristics can count clear movement ranges, but cannot verify load, machine setup, or compensations elsewhere in the body.

Lateral raises use the elbow–shoulder–hip angle, with the user facing the camera so the arm's rise to shoulder height is visible in the image plane. This counts a broad raise-and-lower range, but does not distinguish dumbbell, cable, or machine resistance.

Pull-ups, chin-ups, and assisted pull-ups use the elbow-angle counter and ask for a slightly front or side camera view. This counts the bend-and-return cycle; it does not check that the chin clears the bar or measure machine assistance.

The elbow bend threshold is exercise-name dependent: names containing “curl” use 76 degrees; other elbow exercises use 94 degrees. Knee bends use 102 degrees. The row top/bottom thresholds use elbow angles of 145/115 degrees plus wrist reach; lat pulldown zones use arm-overhead and pulled-down position checks.

Fly rules match cable chest-fly name variants, chest fly names, fly/flyes/flys, pec deck, butterfly, and cable crossover names. They require both shoulders, elbows, and wrists to be visible. Wrist-to-wrist span is divided by shoulder-to-shoulder width; a span at or above 220% is the arms-open zone and 145% or below is the arms-together zone. The camera cue asks the user to face the phone, since a side view hides the across-body span. Chest presses continue to use the elbow-angle rule rather than being treated as fly movements.

Pullover rules use the more visible side's elbow–shoulder–hip angle. An angle at or above 150 degrees is treated as arms overhead; an angle at or below 75 degrees is the lowered zone. The camera cue asks for a side view and visible hip, shoulder, elbow, and wrist. This can recognize a broad overhead-to-lowered path, but it cannot confirm a specific implement (bar, cable, or dumbbell) or distinguish every pullover variation.

All of these are heuristic 2D rules, not a complete biomechanical form evaluation. The span and angle thresholds are initial fixed values and can vary in reliability with camera placement, the user's proportions, exercise technique, and occlusion.

## Rep state machine and feedback

The coach requires a stable zone for at least three analyzed frames. A recognized full repetition follows the sequence:

1. Start in the top/extended zone.
2. Move through the range and reach the bottom/bent zone.
3. Return to the top/extended zone.

Only a bottom-to-top transition increments the rep count. If the user starts moving but returns to the top without reaching the bottom zone, the attempt is recorded as short/incomplete in the on-screen coach summary and is not added to the set rep count. The overlay gives cues such as visibility instructions, full-range prompts, and exercise-specific incomplete-range prompts. Unsupported movements still show a detected skeleton but explicitly say rep guidance is not configured.

Rep duration is measured between counted top positions. The first rep has no pace classification. Later reps under 1.2 seconds are labeled too fast; those over 6 seconds are labeled too slow. These boundaries are simple heuristics and do not adapt to exercise, load, user, or training goal.

When the current planned rep target is reached, the code plays a short browser tone and requests vibration where supported. It calls the active-session callback, which marks the set done. If another unfinished set exists for that exercise, the Form Coach resets its rep counter for the next set. Otherwise, it reports that all sets are complete; the user can end the coach and see a session summary. Summary counts and pace observations live only in component state and disappear when the coach closes.

## Pause, rest, stop, end, and summary

- **Pause/resume:** stops/restarts inference. Resume clears angle/zone history so the user begins from a fresh start position rather than completing a partial rep.
- **Rest timer:** while the workout rest timer is active, inference stops, the skeleton is cleared, and the rest countdown is displayed. Once rest ends, inference resumes automatically if the user has not paused and sets remain; movement state is reset first.
- **Stop analysis:** ends inference and clears the skeleton while leaving the camera screen open. The user can choose a setup countdown to retry.
- **End coach:** stops inference and shows a summary of counted reps, incomplete attempts, and fast/slow observations.
- **Close/cleanup:** closing the screen stops camera tracks, cancels frame processing, closes the landmarker and audio context, and clears the transient coach state with the component.

## Platform status and known limits

`components/FormCoachCameraScreen.web.tsx` contains the live MediaPipe pose overlay and rep-analysis implementation, including for supported mobile browsers that expose `getUserMedia`. It requires a secure HTTPS context (or localhost), camera permission, a supported browser, enough light, and a camera view where the relevant joints remain visible.

`components/FormCoachCameraScreen.tsx` is the native implementation. It uses Expo Camera for a live preview and shows the setup countdown, but its current UI explicitly says pose tracking is not connected; the native file does not load MediaPipe or run the rep-analysis state machine. Therefore, do not describe native iOS/Android app support as equivalent to browser pose analysis yet.

The current system estimates visible 2D joint motion. It cannot reliably assess load, muscle activation, equipment contact, depth in 3D, injury risk, or every form fault. Occlusion, camera angle, loose clothing, lighting, exercise naming, and model landmark jitter can cause false negatives or inaccurate rep cues. The app should present this as an assistive movement guide rather than authoritative coaching.

## Relevant implementation

- `app/index.tsx`: active workout Form button and `FormCoachCameraScreen` integration; callback that marks the reached set complete.
- `components/FormCoachCameraScreen.web.tsx`: browser camera, MediaPipe load, pose landmarks, movement classification, rep state machine, feedback, controls, rest handling, summary, and resource cleanup.
- `components/FormCoachCameraScreen.tsx`: native camera preview and placeholder behavior.
- [Mobile pose coach debugging](mobile-pose-coach-debugging.md): debugging notes for mobile browser pose initialization.
