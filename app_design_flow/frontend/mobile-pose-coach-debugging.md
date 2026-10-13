# Mobile Browser Pose Coach: Debugging Log

## Incident

**Symptom:** Form Coach opens in a mobile browser and the user can reach the camera/analysis flow, but the pose skeleton does not appear or live analysis seems not to start.

**Affected surface:** The Expo web implementation in `components/FormCoachCameraScreen.web.tsx`. Native camera behavior is handled separately and is not covered by this log.

## Diagnosis and confidence

The mobile failure was not reproduced on a physical phone during this investigation. The local browser session was inspected at a mobile-sized viewport, but the open screen was AI Coach and no camera permission was granted for a real device. Therefore the exact device/browser trigger remains unconfirmed.

Source inspection did reveal several failure paths that could leave a mobile user with a working camera preview but no skeleton:

1. **The first camera frame could arrive after the countdown.** `startTracking()` previously returned immediately when `video.readyState` was below `HAVE_CURRENT_DATA`. It did not wait for the video to become ready or tell the user it had stopped trying. Mobile browsers can take longer to deliver the first frame after camera permission is granted.
2. **GPU inference was always attempted first.** Mobile Safari and Android browsers vary in WebGL/GPU delegate support. The old fallback tried CPU only when model initialization failed; it did not prefer the more compatible CPU path on mobile, or explain an inference error thrown later while processing a frame.
3. **Frame-analysis exceptions were invisible in the UI.** A failed `detectForVideo()` call was only written to the developer console, after which the animation loop continued. The user could see the camera but receive no actionable indication that inference had failed.
4. **The completed countdown state was retained.** The countdown reached `0` but was not reset to `null`. The setup/retry choices are shown only when the countdown is `null`, so a failed run could leave the user without a visible retry action.

These are concrete weaknesses in the previous code and plausible causes of the reported symptom; they are not proof that any one of them caused a particular phone's failure.

## Browser messages observed

The local browser's captured console history included these MediaPipe warnings:

```text
landmark_projection_calculator.cc:81
Using NORM_RECT without IMAGE_DIMENSIONS is only supported for the square ROI.
Provide IMAGE_DIMENSIONS or use PROJECTION_MATRIX.

gl_context.cc:1135
OpenGL error checking is disabled
```

These messages are warnings, not by themselves evidence that pose inference failed. The OpenGL warning made GPU compatibility a useful mobile risk to address, but it does not establish the cause.

A `ReferenceError: autoStartedRef is not defined` also appeared once in the local browser's accumulated hot-reload console history during earlier UI edits. The current Form Coach source and the pushed Form Coach commit do not reference `autoStartedRef`; treat that as a transient development hot-reload error, not the root cause of the mobile camera report. If it appears again after a clean reload, capture the current stack and bundle before attributing it to MediaPipe.

## Fix implemented

The web Form Coach now:

- Detects mobile browsers, including iPadOS devices that report a desktop-style Macintosh user agent but have touch points, and initializes MediaPipe with the CPU delegate first on those devices. Desktop browsers continue to prefer GPU. If initialization fails, it retries once with the alternate delegate.
- Waits for up to 10 seconds for the camera's first usable video frame instead of returning silently at countdown completion. If no frame arrives, it stops the wait and displays a camera-specific error.
- Stops the frame loop and displays an error if `detectForVideo()` throws, instead of repeatedly logging the failure while leaving the user with an apparently live but inactive coach. The UI can then offer the setup countdown choices again.
- Clears the countdown state when it reaches zero, so retry choices can render after a failed analysis attempt.

## What to look out for

When triaging another mobile report, capture the device model, OS version, browser/version, whether the camera preview is moving, the exercise name, and the exact visible coach status/error. Keep the following distinctions clear:

- **No preview:** investigate secure-context and permission issues first. `getUserMedia()` requires HTTPS in normal deployments (localhost is a special development context), and the user must grant the site camera access.
- **Preview works, pose never appears:** inspect the visible error and browser console for MediaPipe script/WASM/model download failures, delegate initialization failures, or `detectForVideo()` exceptions. Confirm the page remained in the foreground and the video is producing frames.
- **Skeleton appears, reps do not count:** check whether that exercise has a movement rule. Pose visibility and exercise-specific rep/range analysis are separate capabilities; unsupported movements intentionally do not count arbitrary motion.
- **Analysis is slow on mobile:** the CPU delegate is a compatibility choice and can run more slowly than GPU. Watch for low frame rate, device heat, battery use, and browser tab suspension before increasing inference frequency or model size.
- **Retry controls are missing:** confirm `countdown` returns to `null` after the countdown or an inference failure, and that an error state is surfaced rather than left as an endless loading/tracking state.

The MediaPipe browser bundle and pose model are loaded from external CDNs. Network filtering, offline use, or a blocked CDN can prevent analysis even when camera permission works; the user-facing loading/error state should make this distinguishable from camera permission failure.

## Validation performed

- `npm run export:web` completed successfully after the code change.
- The app rendered at a 390 × 844 browser viewport. This checked the mobile-sized page shell, not the camera inference flow.
- A physical mobile camera session was not available for end-to-end validation, so mobile delegate behavior, real camera startup timing, and skeleton rendering still need confirmation on representative iOS Safari and Android Chrome devices.
- `npm run typecheck` did not pass. It reports existing project errors in `app/index.tsx`, `backend/firebase/deleteAccount.ts`, and `StyleSheet.absoluteFillObject` usages in `app/index.tsx` and this web screen. The latter usages were present in the committed baseline before this debugging change; the export build does pass.
