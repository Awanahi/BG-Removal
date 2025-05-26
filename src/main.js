import { fabric } from 'fabric';
import { saveAs } from 'file-saver';

// Global variables
let canvas;
let images = [];
let currentImageIndex = -1;
let isDrawingMode = false;
let brushMode = 'remove'; // 'remove' or 'restore'

// DOM Elements
const imageUpload = document.getElementById('image-upload');
const removeBgBtn = document.getElementById('remove-bg');
const magicRemoveBtn = document.getElementById('magic-remove');
const magicRestoreBtn = document.getElementById('magic-restore');
const addShadowBtn = document.getElementById('add-shadow');
const blurBgBtn = document.getElementById('blur-bg');
const downloadBtn = document.getElementById('download');
const resetBtn = document.getElementById('reset');
const thumbnailsContainer = document.getElementById('thumbnails');
const loadingOverlay = document.getElementById('loading-overlay');

// Initialize the application
function init() {
  // Initialize canvas
  canvas = new fabric.Canvas('editor-canvas', {
    width: 800,
    height: 500,
    backgroundColor: '#f0f0f0',
    isDrawingMode: false
  });
  
  // Set up brush
  canvas.freeDrawingBrush.width = 20;
  canvas.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.5)';
  
  // Set up event listeners
  setupEventListeners();
  
  // Make sure loading overlay is hidden on initialization
  hideLoading();
}

// Set up event listeners
function setupEventListeners() {
  imageUpload.addEventListener('change', handleImageUpload);
  removeBgBtn.addEventListener('click', removeBackground);
  magicRemoveBtn.addEventListener('click', () => setMagicBrushMode('remove'));
  magicRestoreBtn.addEventListener('click', () => setMagicBrushMode('restore'));
  addShadowBtn.addEventListener('click', addShadow);
  blurBgBtn.addEventListener('click', blurBackground);
  downloadBtn.addEventListener('click', downloadImages);
  resetBtn.addEventListener('click', resetEditor);
}

// Handle image upload
function handleImageUpload(e) {
  const files = e.target.files;
  if (!files.length) return;
  
  // Clear previous images if any
  if (images.length === 0) {
    images = [];
    thumbnailsContainer.innerHTML = '';
  }
  
  // Process each file
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    
    reader.onload = function(event) {
      const imgObj = {
        original: event.target.result,
        edited: event.target.result,
        filename: file.name
      };
      
      images.push(imgObj);
      createThumbnail(imgObj, images.length - 1);
      
      // Select the first image if this is the first upload
      if (currentImageIndex === -1) {
        selectImage(0);
      }
    };
    
    reader.readAsDataURL(file);
  });
}

// Create thumbnail for an image
function createThumbnail(imgObj, index) {
  const img = document.createElement('img');
  img.src = imgObj.edited;
  img.classList.add('thumbnail');
  img.dataset.index = index;
  
  img.addEventListener('click', () => {
    selectImage(parseInt(img.dataset.index));
  });
  
  thumbnailsContainer.appendChild(img);
}

// Select an image to edit
function selectImage(index) {
  // Update current index
  currentImageIndex = index;
  
  // Update thumbnails
  document.querySelectorAll('.thumbnail').forEach(thumb => {
    thumb.classList.remove('active');
    if (parseInt(thumb.dataset.index) === index) {
      thumb.classList.add('active');
    }
  });
  
  // Load image to canvas
  fabric.Image.fromURL(images[index].edited, img => {
    canvas.clear();
    
    // Scale image to fit canvas
    const scale = Math.min(
      canvas.width / img.width,
      canvas.height / img.height
    ) * 0.9;
    
    img.scale(scale);
    
    // Center image
    img.set({
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center'
    });
    
    canvas.add(img);
    canvas.renderAll();
  });
}

// Remove background (simulated)
function removeBackground() {
  if (currentImageIndex === -1) return;
  
  showLoading();
  
  // Simulate background removal with a timeout
  setTimeout(() => {
    const activeObj = canvas.getActiveObject() || canvas.item(0);
    if (!activeObj) {
      hideLoading();
      return;
    }
    
    // For demonstration, we'll add a filter that makes the background transparent
    // In a real app, you'd use a proper ML-based background removal service
    simulateBackgroundRemoval(activeObj);
    
    // Update the edited image
    updateEditedImage();
    
    hideLoading();
  }, 1500);
}

// Simulate background removal (for demo purposes)
function simulateBackgroundRemoval(imgObj) {
  // Apply a simple filter to simulate background removal
  // In a real app, you would use a proper ML-based service
  
  // Create a clipping path (circle for demo)
  const clipPath = new fabric.Circle({
    radius: Math.min(imgObj.width, imgObj.height) * 0.4,
    originX: 'center',
    originY: 'center',
    left: imgObj.width / 2,
    top: imgObj.height / 2
  });
  
  imgObj.clipPath = clipPath;
  canvas.renderAll();
}

// Set magic brush mode
function setMagicBrushMode(mode) {
  if (currentImageIndex === -1) return;
  
  brushMode = mode;
  isDrawingMode = !isDrawingMode;
  
  canvas.isDrawingMode = isDrawingMode;
  
  if (isDrawingMode) {
    // Set brush color based on mode
    if (mode === 'remove') {
      canvas.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.5)';
      magicRemoveBtn.classList.add('primary');
      magicRestoreBtn.classList.remove('primary');
    } else {
      canvas.freeDrawingBrush.color = 'rgba(0, 255, 0, 0.5)';
      magicRemoveBtn.classList.remove('primary');
      magicRestoreBtn.classList.add('primary');
    }
  } else {
    magicRemoveBtn.classList.remove('primary');
    magicRestoreBtn.classList.remove('primary');
  }
  
  // When drawing is complete, apply the effect
  canvas.on('mouse:up', () => {
    if (isDrawingMode) {
      // In a real app, you would process the drawn path
      // For demo, we'll just update the image after a delay
      setTimeout(() => {
        updateEditedImage();
        // Clear paths after processing
        const paths = canvas.getObjects('path');
        paths.forEach(path => canvas.remove(path));
      }, 500);
    }
  });
}

// Add shadow to image
function addShadow() {
  if (currentImageIndex === -1) return;
  
  const activeObj = canvas.getActiveObject() || canvas.item(0);
  if (!activeObj) return;
  
  activeObj.setShadow({
    color: 'rgba(0,0,0,0.5)',
    blur: 20,
    offsetX: 10,
    offsetY: 10
  });
  
  canvas.renderAll();
  updateEditedImage();
}

// Blur background (simulated)
function blurBackground() {
  if (currentImageIndex === -1) return;
  
  showLoading();
  
  // Simulate background blurring with a timeout
  setTimeout(() => {
    // In a real app, you would apply a blur filter to the background
    // For demo, we'll apply a blur filter to the whole image
    const activeObj = canvas.getActiveObject() || canvas.item(0);
    if (!activeObj) {
      hideLoading();
      return;
    }
    
    // Apply blur filter
    activeObj.filters.push(new fabric.Image.filters.Blur({
      blur: 0.25
    }));
    
    activeObj.applyFilters();
    canvas.renderAll();
    
    updateEditedImage();
    hideLoading();
  }, 1000);
}

// Update the edited image in our images array
function updateEditedImage() {
  if (currentImageIndex === -1) return;
  
  images[currentImageIndex].edited = canvas.toDataURL({
    format: 'png',
    quality: 1
  });
  
  // Update thumbnail
  const thumbnails = document.querySelectorAll('.thumbnail');
  thumbnails[currentImageIndex].src = images[currentImageIndex].edited;
}

// Download all edited images
function downloadImages() {
  if (images.length === 0) return;
  
  showLoading();
  
  // If only one image, download it directly
  if (images.length === 1) {
    const dataUrl = images[0].edited;
    const filename = 'edited_' + images[0].filename;
    
    // Convert data URL to Blob
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        saveAs(blob, filename);
        hideLoading();
      });
    return;
  }
  
  // For multiple images, create a zip file (in a real app)
  // For demo, we'll just download them one by one with a delay
  let i = 0;
  const downloadNext = () => {
    if (i >= images.length) {
      hideLoading();
      return;
    }
    
    const dataUrl = images[i].edited;
    const filename = 'edited_' + images[i].filename;
    
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        saveAs(blob, filename);
        i++;
        setTimeout(downloadNext, 500);
      });
  };
  
  downloadNext();
}

// Reset the editor
function resetEditor() {
  canvas.clear();
  images = [];
  currentImageIndex = -1;
  thumbnailsContainer.innerHTML = '';
  imageUpload.value = '';
}

// Show loading overlay
function showLoading() {
  loadingOverlay.classList.remove('hidden');
}

// Hide loading overlay
function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
