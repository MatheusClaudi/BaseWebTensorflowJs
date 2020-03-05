import { Component, OnInit } from '@angular/core';
import * as tf from '@tensorflow/tfjs'
import { loadGraphModel } from '@tensorflow/tfjs-converter'
const MODEL_URL = 'http://localhost:8081/web_model/model.json'


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit 
{
  title = 'TF-ObjectDetection';
  private video: HTMLVideoElement;
  
  streamPromise: any =  null;
  modelPromise: any =  null;
  // control the UI visibilities
  isVideoStreamReady: any =  false;
  isModelReady: any =  false;
  initFailMessage: any =  '';
  // tfjs model related
  model: any =  null;
  videoRatio: any = 1;
  resultWidth: any =  0;
  resultHeight: any =  0;  

  ngOnInit()
  { 
    this.streamPromise = this.initWebcamStream()
    this.loadModelAndDetection()

  }

  initWebcamStream () {
    
    this.video = <HTMLVideoElement> document.getElementById("vid")
    // if the browser supports mediaDevices.getUserMedia API
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      return navigator.mediaDevices.getUserMedia({
        audio: false, // don't capture audio
        video: { facingMode: 'environment' } // use the rear camera if there is
      })
        .then(stream => {
          // set <video> source as the webcam input
          let video = this.video
          try {
            video.srcObject = stream
          } catch (error) {
            // support older browsers
            video.src = URL.createObjectURL(stream)
          }
          /*
            model.detect uses tf.fromPixels to create tensors.
            tf.fromPixels api will get the <video> size from the width and height attributes,
              which means <video> width and height attributes needs to be set before called model.detect
            To make the <video> responsive, I get the initial video ratio when it's loaded (onloadedmetadata)
            Then addEventListener on resize, which will adjust the size but remain the ratio
            At last, resolve the Promise.
          */
          return new Promise((resolve, reject) => {
            // when video is loaded
            video.onloadedmetadata = () => {
              // calculate the video ratio
              this.videoRatio = video.offsetHeight / video.offsetWidth
              // add event listener on resize to reset the <video> and <canvas> sizes
              window.addEventListener('resize', this.setResultSize)
              // set the initial size
              this.setResultSize()
              this.isVideoStreamReady = true
              console.log('webcam stream initialized')
              resolve()
            }
          })
        })
        .catch(error => {
          console.log('failed to initialize webcam stream', error)
          throw (error)
        })
    } else {
      return Promise.reject(new Error('Your browser does not support mediaDevices.getUserMedia API'))
    }
  }

  setResultSize () {

    this.video = <HTMLVideoElement> document.getElementById("vid")

    // get the current browser window size
    let clientWidth = document.documentElement.clientWidth
    // set max width as 600
    this.resultWidth = Math.min(600, clientWidth)
    // set the height according to the video ratio
    this.resultHeight = this.resultWidth * this.videoRatio
    // set <video> width and height
    /*
      Doesn't use vue binding :width and :height,
        because the initial value of resultWidth and resultHeight
        will affect the ratio got from the initWebcamStream()
    */
    let video = this.video
    video.width = this.resultWidth
    video.height = this.resultHeight
  }



  loadCustomModel () {
    this.isModelReady = false
    // load the model with loadGraphModel
    return loadGraphModel(MODEL_URL)
      .then((model) => {
        this.model = model
        this.isModelReady = true
        console.log('model loaded: ', model)
      })
      .catch((error) => {
        console.log('failed to load the model', error)
        throw (error)
      })
  }

  async detectObjects () {
    if (!this.isModelReady) return

    console.log("b")

    const tfImg = tf.browser.fromPixels(this.video)
    console.log("c1")

    const smallImg = tf.image.resizeBilinear(tfImg, [300, 300]) // 600, 450
    console.log("c2")

    const resized = tf.cast(smallImg, 'float32')
    console.log("c3")

    const tf4d = tf.tensor4d(Array.from(resized.dataSync()), [1, 300, 300, 3]) // 600, 450

    console.log("c4")

    let predictions = await this.model.executeAsync({ image_tensor: tf4d }, ['detection_boxes', 'num_detections', 'detection_classes', 'detection_scores'])

    console.log("c5")

    this.renderPredictionBoxes(predictions[0].dataSync(), predictions[1].dataSync(), predictions[2].dataSync(), predictions[3].dataSync())
    tfImg.dispose()
    smallImg.dispose()
    resized.dispose()
    tf4d.dispose()
    requestAnimationFrame(() => {
      this.detectObjects()
    })
  }

  loadModelAndDetection () {
    this.modelPromise = this.loadCustomModel()
    // wait for both stream and model promise finished then start detecting objects
    Promise.all([this.streamPromise, this.modelPromise])
      .then(() => {
        console.log("aa")
        this.detectObjects()
      }).catch((error) => {
        console.log('Failed to init stream and/or model: ')
        this.initFailMessage = error
      })
  }

  renderPredictionBoxes (predictionBoxes, totalPredictions, predictionClasses, predictionScores) {
    // get the context of canvas
    let canvas = <HTMLCanvasElement> document.getElementById("canvas")

    const ctx = canvas.getContext('2d')
    // clear the canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    // draw results
    for (let i = 0; i < totalPredictions[0]; i++) {
      const minY = predictionBoxes[i * 4] * 450
      const minX = predictionBoxes[i * 4 + 1] * 600
      const maxY = predictionBoxes[i * 4 + 2] * 450
      const maxX = predictionBoxes[i * 4 + 3] * 600
      const score = predictionScores[i * 3] * 100
      const label = predictionClasses[i]

      if (score > 75) {
        ctx.beginPath()
        ctx.rect(minX, minY, maxX - minX, maxY - minY)
        ctx.lineWidth = 3
        ctx.strokeStyle = 'red'
        ctx.fillStyle = 'red'
        ctx.stroke()
        ctx.shadowColor = 'white'
        ctx.shadowBlur = 10
        ctx.font = '14px Arial bold'
        ctx.fillText(
          `${score.toFixed(1)} - ${label}`,
          minX,
          minY > 10 ? minY - 5 : 10
        )
      }
    }
  }
}