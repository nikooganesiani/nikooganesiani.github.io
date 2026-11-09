Browser-only visual search dependencies (Apache-2.0).

tf.min.js: @tensorflow/tfjs 4.22.0
https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js
License: TENSORFLOW-LICENSE.txt

mobilenet.min.js: @tensorflow-models/mobilenet 2.1.1
https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js
License: MOBILENET-LICENSE.txt

These files are loaded on demand by assets/js/main/photo-search.js.
The MobileNet V2 1.0 weights load from the model URL in the pinned MobileNet library.
No uploaded photo is sent to that host. Inference runs locally.
