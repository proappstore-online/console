/**
 * The `allow` attribute for an iframe that previews a hosted app (platform#436):
 * every browser feature delegated to the framed app's origin, so a mic, camera or
 * motion app works inside the preview. The browser still prompts the user.
 *
 * Vendored from platform packages/host/src/capabilities.ts (PREVIEW_IFRAME_ALLOW):
 * keep the two equal. The console's own Permissions-Policy (public/_headers)
 * allows each feature to `*` so this delegation can take effect.
 */
export const PREVIEW_IFRAME_ALLOW = "accelerometer 'src'; ambient-light-sensor 'src'; attribution-reporting 'src'; autoplay 'src'; bluetooth 'src'; camera 'src'; clipboard-read 'src'; clipboard-write 'src'; compute-pressure 'src'; display-capture 'src'; encrypted-media 'src'; fullscreen 'src'; gamepad 'src'; geolocation 'src'; gyroscope 'src'; hid 'src'; identity-credentials-get 'src'; idle-detection 'src'; local-fonts 'src'; magnetometer 'src'; microphone 'src'; midi 'src'; otp-credentials 'src'; payment 'src'; picture-in-picture 'src'; publickey-credentials-create 'src'; publickey-credentials-get 'src'; screen-wake-lock 'src'; serial 'src'; storage-access 'src'; usb 'src'; web-share 'src'; window-management 'src'; xr-spatial-tracking 'src'";
