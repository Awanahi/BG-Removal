import { fabric } from 'fabric';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import Toastify from 'toastify-js';
import "toastify-js/src/toastify.css";

// Global variables
let canvas;
let images = [];
let currentImageIndex = -1;
let isDrawingMode = false;
let brushMode = 'remove'; // 'remove' or 'restore'
let originalImageData = null; // Store original image data for reset functionality

// Initialize the application
function init() {
  // Get DOM Elements
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
  
  // Explicitly hide loading overlay at startup
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
    console.log('Loading overlay hidden');
  } else {
    console.error('Loading overlay element not found');
  }
  
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
  
  // Helper functions for loading overlay
  function showLoading(message = 'Processing...') {
    if (loadingOverlay) {
      const loadingText = loadingOverlay.querySelector('.loading-text');
      if (loadingText) loadingText.textContent = message;
      loadingOverlay.classList.remove('hidden');
    }
  }
  
  function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
  
  // Show toast notification
  function showToast(message, type = 'info') {
    const backgroundColor = type === 'success' ? '#28a745' : 
                           type === 'error' ? '#dc3545' : 
                           '#4a6bff';
    
    Toastify({
      text: message,
      duration: 3000,
      gravity: "top",
      position: "right",
      backgroundColor,
      stopOnFocus: true
    }).showToast();
  }
  
  // Handle image upload
  function handleImageUpload(e) {
    const files = e.target.files;
    if (!files.length) return;
    
    showLoading('Uploading images...');
    
    // Clear previous images if any
    if (images.length === 0) {
      images = [];
      thumbnailsContainer.innerHTML = '';
    }
    
    let loadedCount = 0;
    const totalFiles = files.length;
    
    // Process each file
    Array.from(files).forEach(file => {
      // Validate file type
      if (!file.type.match('image.*')) {
        showToast(`${file.name} is not a valid image file`, 'error');
        loadedCount++;
        if (loadedCount === totalFiles) hideLoading();
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = function(event) {
        const imgObj = {
          original: event.target.result,
          edited: event.target.result,
          filename: file.name
        };
        
        images.push(imgObj);
        createThumbnail(imgObj, images.length - 1);
        
        loadedCount++;
        if (loadedCount === totalFiles) {
          hideLoading();
          showToast(`${totalFiles} image${totalFiles > 1 ? 's' : ''} uploaded successfully`, 'success');
          
          // Select the first image if this is the first upload
          if (currentImageIndex === -1) {
            selectImage(0);
          }
        }
      };
      
      reader.onerror = function() {
        showToast(`Failed to load ${file.name}`, 'error');
        loadedCount++;
        if (loadedCount === totalFiles) hideLoading();
      };
      
      reader.readAsDataURL(file);
    });
  }
  
  // Create thumbnail for an image
  function createThumbnail(imgObj, index) {
    const thumbnail = document.createElement('div');
    thumbnail.classList.add('thumbnail-wrapper');
    
    const img = document.createElement('img');
    img.src = imgObj.edited;
    img.classList.add('thumbnail');
    img.dataset.index = index;
    img.alt = imgObj.filename;
    
    const label = document.createElement('div');
    label.classList.add('thumbnail-label');
    label.textContent = imgObj.filename.length > 15 ? 
      imgObj.filename.substring(0, 12) + '...' : 
      imgObj.filename;
    
    thumbnail.appendChild(img);
    thumbnail.appendChild(label);
    
    thumbnail.addEventListener('click', () => {
      selectImage(parseInt(img.dataset.index));
    });
    
    thumbnailsContainer.appendChild(thumbnail);
  }
  
  // Select an image to edit
  function selectImage(index) {
    if (index < 0 || index >= images.length) {
      showToast('Invalid image selection', 'error');
      return;
    }
    
    // Update current index
    currentImageIndex = index;
    
    // Update thumbnails
    document.querySelectorAll('.thumbnail').forEach(thumb => {
      thumb.classList.remove('active');
      if (parseInt(thumb.dataset.index) === index) {
        thumb.classList.add('active');
      }
    });
    
    // Store original image data for reset functionality
    originalImageData = images[index].original;
    
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
      
      // Exit drawing mode when switching images
      if (isDrawingMode) {
        isDrawingMode = false;
        canvas.isDrawingMode = false;
        magicRemoveBtn.classList.remove('primary');
        magicRestoreBtn.classList.remove('primary');
      }
      
      showToast(`Editing: ${images[index].filename}`, 'info');
    }, null, {
      crossOrigin: 'anonymous'
    });
  }
  
  // Enhanced background removal with sophisticated detection
  function removeBackground() {
    if (currentImageIndex === -1) {
      showToast('Please select an image first', 'error');
      return;
    }
    
    showLoading('Removing background...');
    
    const activeObj = canvas.getActiveObject() || canvas.item(0);
    if (!activeObj) {
      hideLoading();
      showToast('No image found on canvas', 'error');
      return;
    }
    
    setTimeout(() => {
      try {
        // Create a temporary canvas to manipulate the image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Set dimensions
        tempCanvas.width = activeObj.width * activeObj.scaleX;
        tempCanvas.height = activeObj.height * activeObj.scaleY;
        
        // Draw the image on the temporary canvas
        const img = new Image();
        img.src = images[currentImageIndex].edited;
        
        img.onload = function() {
          tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
          
          // Get image data
          const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          const data = imageData.data;
          
          // Enhanced background detection with clothing and skin preservation
          const backgroundMask = improvedBackgroundDetection(data, tempCanvas.width, tempCanvas.height);
          
          // Apply the mask to the image
          for (let i = 0; i < data.length; i += 4) {
            if (backgroundMask[i/4]) {
              data[i + 3] = 0; // Make pixel transparent
            }
          }
          
          // Put the modified image data back
          tempCtx.putImageData(imageData, 0, 0);
          
          // Replace the image on the canvas
          fabric.Image.fromURL(tempCanvas.toDataURL(), newImg => {
            canvas.clear();
            
            // Scale image to fit canvas
            const scale = Math.min(
              canvas.width / newImg.width,
              canvas.height / newImg.height
            ) * 0.9;
            
            newImg.scale(scale);
            
            // Center image
            newImg.set({
              left: canvas.width / 2,
              top: canvas.height / 2,
              originX: 'center',
              originY: 'center'
            });
            
            canvas.add(newImg);
            canvas.renderAll();
            
            // Update the edited image
            updateEditedImage();
            
            hideLoading();
            showToast('Background removed successfully', 'success');
          }, null, {
            crossOrigin: 'anonymous'
          });
        };
        
        img.onerror = function() {
          hideLoading();
          showToast('Failed to process image', 'error');
        };
      } catch (error) {
        console.error('Background removal error:', error);
        hideLoading();
        showToast('Failed to remove background', 'error');
      }
    }, 1000);
  }
  
  // Improved background detection algorithm with clothing and skin preservation
  function improvedBackgroundDetection(imageData, width, height) {
    // 1. Sample points from the edges only
    const sampledColors = sampleEdgesOnly(imageData, width, height);
    
    // 2. Group similar colors and find dominant background colors
    const dominantColors = findDominantColors(sampledColors);
    
    // 3. Create initial background mask
    const initialMask = createInitialBackgroundMask(imageData, width, height, dominantColors);
    
    // 4. Detect skin tones
    const skinToneMask = detectSkinTones(imageData, width, height);
    
    // 5. Detect clothing
    const clothingMask = detectClothing(imageData, width, height);
    
    // 6. Combine all masks and refine
    return refineCompositeMask(initialMask, skinToneMask, clothingMask, imageData, width, height);
  }
  
  // Sample colors from edges only
  function sampleEdgesOnly(imageData, width, height) {
    const sampledColors = [];
    const samplesPerEdge = 80; // Increased for better sampling
    const edgeDepth = Math.max(5, Math.floor(Math.min(width, height) * 0.03)); // Sample from outer 3% of image
    
    // Sample top edge
    for (let i = 0; i < samplesPerEdge; i++) {
      const x = Math.floor(width * (i / (samplesPerEdge - 1)));
      for (let d = 0; d < edgeDepth; d++) {
        sampledColors.push(getPixelColor(imageData, x, d, width));
      }
    }
    
    // Sample bottom edge
    for (let i = 0; i < samplesPerEdge; i++) {
      const x = Math.floor(width * (i / (samplesPerEdge - 1)));
      for (let d = 0; d < edgeDepth; d++) {
        sampledColors.push(getPixelColor(imageData, x, height - 1 - d, width));
      }
    }
    
    // Sample left edge
    for (let i = 0; i < samplesPerEdge; i++) {
      const y = Math.floor(height * (i / (samplesPerEdge - 1)));
      for (let d = 0; d < edgeDepth; d++) {
        sampledColors.push(getPixelColor(imageData, d, y, width));
      }
    }
    
    // Sample right edge
    for (let i = 0; i < samplesPerEdge; i++) {
      const y = Math.floor(height * (i / (samplesPerEdge - 1)));
      for (let d = 0; d < edgeDepth; d++) {
        sampledColors.push(getPixelColor(imageData, width - 1 - d, y, width));
      }
    }
    
    return sampledColors;
  }
  
  // Find dominant colors using weighted color grouping
  function findDominantColors(sampledColors) {
    // Filter out fully transparent pixels
    const validColors = sampledColors.filter(color => color.a > 0);
    if (validColors.length === 0) return [];
    
    // Group similar colors
    const colorGroups = [];
    
    for (const color of validColors) {
      let foundGroup = false;
      
      for (const group of colorGroups) {
        // Use perceptual color distance with a tighter threshold
        if (perceptualColorDistance(color, group.representative) < 20) {
          group.colors.push(color);
          group.count++;
          
          // Update the representative color (weighted average)
          const totalColors = group.colors.length;
          group.representative = {
            r: Math.round((group.representative.r * (totalColors - 1) + color.r) / totalColors),
            g: Math.round((group.representative.g * (totalColors - 1) + color.g) / totalColors),
            b: Math.round((group.representative.b * (totalColors - 1) + color.b) / totalColors),
            a: Math.round((group.representative.a * (totalColors - 1) + color.a) / totalColors)
          };
          
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        colorGroups.push({
          representative: { ...color },
          colors: [color],
          count: 1
        });
      }
    }
    
    // Sort groups by count (descending)
    colorGroups.sort((a, b) => b.count - a.count);
    
    // Calculate total weight
    const totalSamples = validColors.length;
    
    // Select dominant colors (groups that represent at least 8% of samples)
    // Using a lower threshold to be more inclusive about background colors
    const dominantColors = colorGroups
      .filter(group => (group.count / totalSamples) >= 0.08)
      .map(group => group.representative);
    
    return dominantColors;
  }
  
  // Create initial background mask
  function createInitialBackgroundMask(imageData, width, height, dominantColors) {
    const totalPixels = width * height;
    const mask = new Array(totalPixels).fill(false);
    
    // If no dominant colors found, return empty mask
    if (dominantColors.length === 0) return mask;
    
    // Process each pixel
    for (let i = 0; i < totalPixels; i++) {
      const pixelIndex = i * 4;
      const pixelColor = {
        r: imageData[pixelIndex],
        g: imageData[pixelIndex + 1],
        b: imageData[pixelIndex + 2],
        a: imageData[pixelIndex + 3]
      };
      
      // Skip fully transparent pixels
      if (pixelColor.a === 0) {
        mask[i] = true;
        continue;
      }
      
      // Check if pixel is similar to any dominant color
      let minDistance = 255;
      for (const dominantColor of dominantColors) {
        const distance = perceptualColorDistance(pixelColor, dominantColor);
        minDistance = Math.min(minDistance, distance);
      }
      
      // More aggressive background detection
      if (minDistance < 25) {
        mask[i] = true;
      }
    }
    
    return mask;
  }
  
  // Detect skin tones in the image
  function detectSkinTones(imageData, width, height) {
    const totalPixels = width * height;
    const skinMask = new Array(totalPixels).fill(false);
    
    // Process each pixel
    for (let i = 0; i < totalPixels; i++) {
      const pixelIndex = i * 4;
      const r = imageData[pixelIndex];
      const g = imageData[pixelIndex + 1];
      const b = imageData[pixelIndex + 2];
      const a = imageData[pixelIndex + 3];
      
      // Skip transparent pixels
      if (a === 0) continue;
      
      // Convert to HSV for better skin tone detection
      const hsv = rgbToHsv(r, g, b);
      
      // Skin tone detection rules (covers various skin tones)
      // These ranges are expanded to cover more skin tones
      if (
        // Light to medium skin tones
        (hsv.h >= 0 && hsv.h <= 50 && hsv.s >= 0.1 && hsv.s <= 0.8 && hsv.v >= 0.35 && hsv.v <= 0.95) ||
        // Darker skin tones
        (hsv.h >= 0 && hsv.h <= 35 && hsv.s >= 0.1 && hsv.s <= 0.8 && hsv.v >= 0.2 && hsv.v <= 0.8)
      ) {
        // Additional check: R > G > B pattern common in skin tones
        if (r > g && g > b) {
          skinMask[i] = true;
        }
      }
    }
    
    // Apply morphological operations to clean up the skin mask
    let refinedSkinMask = dilate(skinMask, width, height);
    refinedSkinMask = erode(refinedSkinMask, width, height);
    
    // Connect nearby skin regions
    refinedSkinMask = dilate(refinedSkinMask, width, height);
    refinedSkinMask = dilate(refinedSkinMask, width, height);
    refinedSkinMask = erode(refinedSkinMask, width, height);
    
    return refinedSkinMask;
  }
  
  // RGB to HSV conversion
  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let h, s, v;
    
    // Calculate hue
    if (delta === 0) {
      h = 0;
    } else if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    
    // Calculate saturation
    s = max === 0 ? 0 : delta / max;
    
    // Calculate value
    v = max;
    
    return { h, s, v };
  }
  
  // Detect clothing in the image
  function detectClothing(imageData, width, height) {
    const totalPixels = width * height;
    const clothingMask = new Array(totalPixels).fill(false);
    
    // First pass: detect potential clothing areas based on texture and color
    for (let i = 0; i < totalPixels; i++) {
      const pixelIndex = i * 4;
      const r = imageData[pixelIndex];
      const g = imageData[pixelIndex + 1];
      const b = imageData[pixelIndex + 2];
      const a = imageData[pixelIndex + 3];
      
      // Skip transparent pixels
      if (a === 0) continue;
      
      const x = i % width;
      const y = Math.floor(i / width);
      
      // Skip edge pixels
      if (x < 5 || x >= width - 5 || y < 5 || y >= height - 5) continue;
      
      // Check for white/light clothing
      const brightness = (r + g + b) / 3;
      if (brightness > 180) {
        // For white/light areas, check if it's part of a continuous region
        if (isPartOfContinuousRegion(i, imageData, width, height, 180)) {
          clothingMask[i] = true;
        }
      }
      
      // Check for textured areas (like fabric)
      if (isTexturedRegion(i, imageData, width, height)) {
        clothingMask[i] = true;
      }
      
      // Check for high contrast areas (like text or graphics on clothing)
      if (isHighContrastArea(i, imageData, width, height)) {
        clothingMask[i] = true;
      }
    }
    
    // Apply morphological operations to clean up the clothing mask
    let refinedClothingMask = dilate(clothingMask, width, height);
    refinedClothingMask = erode(refinedClothingMask, width, height);
    
    // Connect nearby clothing regions
    refinedClothingMask = dilate(refinedClothingMask, width, height);
    refinedClothingMask = dilate(refinedClothingMask, width, height);
    refinedClothingMask = erode(refinedClothingMask, width, height);
    
    return refinedClothingMask;
  }
  
  // Check if a pixel is part of a textured region (like fabric)
  function isTexturedRegion(idx, imageData, width, height) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    // Get center pixel color
    const centerColor = getPixelColor(imageData, x, y, width);
    
    // Calculate texture variance in a 5x5 neighborhood
    let varianceSum = 0;
    let sampleCount = 0;
    
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborColor = getPixelColor(imageData, nx, ny, width);
          const colorDiff = perceptualColorDistance(centerColor, neighborColor);
          varianceSum += colorDiff;
          sampleCount++;
        }
      }
    }
    
    // Calculate average variance
    const avgVariance = varianceSum / sampleCount;
    
    // Texture has moderate variance - not too smooth, not too chaotic
    return avgVariance > 5 && avgVariance < 25;
  }
  
  // Combine and refine all masks
  function refineCompositeMask(initialMask, skinMask, clothingMask, imageData, width, height) {
    const totalPixels = width * height;
    const compositeMask = new Array(totalPixels).fill(false);
    
    // First, flood fill from definite background regions
    const floodFilledBackground = floodFillBackground(initialMask, width, height);
    
    // Combine all information
    for (let i = 0; i < totalPixels; i++) {
      // If it's skin or clothing, preserve it
      if (skinMask[i] || clothingMask[i]) {
        compositeMask[i] = false; // Not background, preserve
      } 
      // If it's definite background from flood fill, remove it
      else if (floodFilledBackground[i]) {
        compositeMask[i] = true; // Background, remove
      }
      // For uncertain areas, use additional heuristics
      else {
        const x = i % width;
        const y = Math.floor(i / width);
        
        // If it's near the edge, likely background
        if (x < 10 || x >= width - 10 || y < 10 || y >= height - 10) {
          compositeMask[i] = true;
        }
        // If it's surrounded by background, likely background
        else if (isSurroundedByBackground(i, floodFilledBackground, width, height)) {
          compositeMask[i] = true;
        }
        // If it's part of a small isolated region, likely background
        else if (!isPartOfLargeRegion(i, floodFilledBackground, width, height)) {
          compositeMask[i] = true;
        }
        // Otherwise, preserve it
        else {
          compositeMask[i] = false;
        }
      }
    }
    
    // Final cleanup with morphological operations
    let finalMask = compositeMask;
    
    // Close small holes
    finalMask = dilate(finalMask, width, height);
    finalMask = erode(finalMask, width, height);
    
    // Remove small isolated background regions
    finalMask = erode(finalMask, width, height);
    finalMask = dilate(finalMask, width, height);
    
    // Ensure edges are properly removed
    finalMask = ensureEdgesRemoved(finalMask, width, height);
    
    return finalMask;
  }
  
  // Check if a pixel is surrounded by background
  function isSurroundedByBackground(idx, backgroundMask, width, height) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    let backgroundCount = 0;
    let totalChecked = 0;
    
    // Check in a 5x5 neighborhood
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          totalChecked++;
          if (backgroundMask[ny * width + nx]) {
            backgroundCount++;
          }
        }
      }
    }
    
    // If more than 70% of neighbors are background, consider it surrounded
    return backgroundCount > totalChecked * 0.7;
  }
  
  // Check if a pixel is part of a large region
  function isPartOfLargeRegion(idx, backgroundMask, width, height) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    // If this pixel is already marked as background, it's not part of a foreground region
    if (backgroundMask[idx]) return false;
    
    // Flood fill to find the size of the connected region
    const visited = new Array(width * height).fill(false);
    let regionSize = 0;
    const queue = [{x, y}];
    visited[idx] = true;
    
    while (queue.length > 0 && regionSize < 500) { // Stop early if region is large enough
      const current = queue.shift();
      regionSize++;
      
      // Check 4-connected neighbors
      const neighbors = [
        {x: current.x + 1, y: current.y},
        {x: current.x - 1, y: current.y},
        {x: current.x, y: current.y + 1},
        {x: current.x, y: current.y - 1}
      ];
      
      for (const neighbor of neighbors) {
        if (neighbor.x >= 0 && neighbor.x < width && 
            neighbor.y >= 0 && neighbor.y < height) {
          const neighborIdx = neighbor.y * width + neighbor.x;
          if (!visited[neighborIdx] && !backgroundMask[neighborIdx]) {
            visited[neighborIdx] = true;
            queue.push(neighbor);
          }
        }
      }
    }
    
    // Consider it a large region if size is above threshold
    return regionSize >= 100;
  }
  
  // Ensure edges of the image are properly removed
  function ensureEdgesRemoved(mask, width, height) {
    const result = [...mask];
    const edgeWidth = 5;
    
    // Mark all edge pixels as background
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < edgeWidth || x >= width - edgeWidth || 
            y < edgeWidth || y >= height - edgeWidth) {
          result[y * width + x] = true;
        }
      }
    }
    
    return result;
  }
  
  // Detect edges in the image
  function detectEdges(imageData, width, height) {
    const totalPixels = width * height;
    const edges = new Array(totalPixels).fill(false);
    
    // Simple Sobel edge detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Get 3x3 neighborhood
        const tl = getPixelBrightness(imageData, x-1, y-1, width);
        const t = getPixelBrightness(imageData, x, y-1, width);
        const tr = getPixelBrightness(imageData, x+1, y-1, width);
        const l = getPixelBrightness(imageData, x-1, y, width);
        const c = getPixelBrightness(imageData, x, y, width);
        const r = getPixelBrightness(imageData, x+1, y, width);
        const bl = getPixelBrightness(imageData, x-1, y+1, width);
        const b = getPixelBrightness(imageData, x, y+1, width);
        const br = getPixelBrightness(imageData, x+1, y+1, width);
        
        // Horizontal and vertical gradients
        const gx = (tr + 2*r + br) - (tl + 2*l + bl);
        const gy = (bl + 2*b + br) - (tl + 2*t + tr);
        
        // Gradient magnitude
        const g = Math.sqrt(gx*gx + gy*gy);
        
        // Threshold for edge detection
        if (g > 30) {
          edges[idx] = true;
        }
      }
    }
    
    return edges;
  }
  
  // Get pixel brightness
  function getPixelBrightness(imageData, x, y, width) {
    const idx = (y * width + x) * 4;
    return (imageData[idx] + imageData[idx+1] + imageData[idx+2]) / 3;
  }
  
  // Flood fill from background regions
  function floodFillBackground(definiteBackground, width, height) {
    const result = [...definiteBackground];
    const queue = [];
    
    // Start from the edges
    for (let x = 0; x < width; x++) {
      if (definiteBackground[x]) {
        queue.push(x);
      }
      if (definiteBackground[(height-1) * width + x]) {
        queue.push((height-1) * width + x);
      }
    }
    
    for (let y = 0; y < height; y++) {
      if (definiteBackground[y * width]) {
        queue.push(y * width);
      }
      if (definiteBackground[y * width + width - 1]) {
        queue.push(y * width + width - 1);
      }
    }
    
    // BFS flood fill
    while (queue.length > 0) {
      const idx = queue.shift();
      const x = idx % width;
      const y = Math.floor(idx / width);
      
      // Check 4-connected neighbors
      const neighbors = [
        {x: x+1, y: y},
        {x: x-1, y: y},
        {x: x, y: y+1},
        {x: x, y: y-1}
      ];
      
      for (const neighbor of neighbors) {
        if (neighbor.x >= 0 && neighbor.x < width && 
            neighbor.y >= 0 && neighbor.y < height) {
          const neighborIdx = neighbor.y * width + neighbor.x;
          if (!result[neighborIdx]) {
            result[neighborIdx] = true;
            queue.push(neighborIdx);
          }
        }
      }
    }
    
    return result;
  }
  
  // Check if a pixel has a neighbor in the given set
  function hasNeighborInSet(idx, set, width, height) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    // Check 8-connected neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborIdx = ny * width + nx;
          if (set[neighborIdx]) {
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  // Check if a pixel is in a high contrast area (likely text)
  function isHighContrastArea(idx, imageData, width, height) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    // Get center pixel brightness
    const centerBrightness = getPixelBrightness(imageData, x, y, width);
    
    // Check contrast with neighbors
    let highContrastCount = 0;
    
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborBrightness = getPixelBrightness(imageData, nx, ny, width);
          const contrast = Math.abs(centerBrightness - neighborBrightness);
          
          if (contrast > 50) {
            highContrastCount++;
          }
        }
      }
    }
    
    // If there are several high contrast neighbors, it's likely text
    return highContrastCount >= 3;
  }
  
  // Check if a pixel is part of a continuous region of similar brightness
  function isPartOfContinuousRegion(idx, imageData, width, height, brightnessThreshold) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    // Get center pixel brightness
    const centerBrightness = getPixelBrightness(imageData, x, y, width);
    
    // If it's not bright enough, return false
    if (centerBrightness < brightnessThreshold) {
      return false;
    }
    
    // Count similar brightness neighbors
    let similarCount = 0;
    let totalChecked = 0;
    
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          totalChecked++;
          const neighborBrightness = getPixelBrightness(imageData, nx, ny, width);
          const diff = Math.abs(centerBrightness - neighborBrightness);
          
          if (diff < 30) {
            similarCount++;
          }
        }
      }
    }
    
    // If most neighbors have similar brightness, it's part of a continuous region
    return similarCount > totalChecked * 0.6;
  }
  
  // Find connected regions in the mask
  function findConnectedRegions(mask, width, height, targetValue) {
    const visited = new Array(mask.length).fill(false);
    const regions = [];
    
    for (let i = 0; i < mask.length; i++) {
      if (!visited[i] && mask[i] === targetValue) {
        // Start a new region
        const region = {
          pixels: [],
          size: 0
        };
        
        // BFS to find all connected pixels
        const queue = [i];
        visited[i] = true;
        
        while (queue.length > 0) {
          const idx = queue.shift();
          region.pixels.push(idx);
          region.size++;
          
          const x = idx % width;
          const y = Math.floor(idx / width);
          
          // Check 4-connected neighbors
          const neighbors = [
            {x: x+1, y: y},
            {x: x-1, y: y},
            {x: x, y: y+1},
            {x: x, y: y-1}
          ];
          
          for (const neighbor of neighbors) {
            if (neighbor.x >= 0 && neighbor.x < width && 
                neighbor.y >= 0 && neighbor.y < height) {
              const neighborIdx = neighbor.y * width + neighbor.x;
              if (!visited[neighborIdx] && mask[neighborIdx] === targetValue) {
                visited[neighborIdx] = true;
                queue.push(neighborIdx);
              }
            }
          }
        }
        
        regions.push(region);
      }
    }
    
    return regions;
  }
  
  // Erosion operation
  function erode(mask, width, height) {
    const result = new Array(mask.length).fill(false);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Check 3x3 neighborhood
        let allBackground = true;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const neighborIdx = (y + dy) * width + (x + dx);
            if (!mask[neighborIdx]) {
              allBackground = false;
              break;
            }
          }
          if (!allBackground) break;
        }
        
        result[idx] = allBackground;
      }
    }
    
    return result;
  }
  
  // Dilation operation
  function dilate(mask, width, height) {
    const result = [...mask];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Check 3x3 neighborhood
        let anyBackground = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const neighborIdx = (y + dy) * width + (x + dx);
            if (mask[neighborIdx]) {
              anyBackground = true;
              break;
            }
          }
          if (anyBackground) break;
        }
        
        result[idx] = anyBackground;
      }
    }
    
    return result;
  }
  
  // Perceptually weighted color distance function
  function perceptualColorDistance(color1, color2) {
    // Convert RGB to Lab color space for perceptual distance
    // This is a simplified approximation of CIEDE2000
    
    // Weights for RGB components based on human perception
    const rWeight = 0.299;
    const gWeight = 0.587;
    const bWeight = 0.114;
    
    // Calculate weighted Euclidean distance
    const rDiff = color1.r - color2.r;
    const gDiff = color1.g - color2.g;
    const bDiff = color1.b - color2.b;
    
    return Math.sqrt(
      rWeight * rDiff * rDiff +
      gWeight * gDiff * gDiff +
      bWeight * bDiff * bDiff
    );
  }
  
  // Helper function to get pixel color
  function getPixelColor(data, x, y, width) {
    const index = (y * width + x) * 4;
    return {
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
      a: data[index + 3]
    };
  }
  
  // Set magic brush mode
  function setMagicBrushMode(mode) {
    if (currentImageIndex === -1) {
      showToast('Please select an image first', 'error');
      return;
    }
    
    // Toggle drawing mode if clicking the same button
    if (isDrawingMode && brushMode === mode) {
      isDrawingMode = false;
      canvas.isDrawingMode = false;
      magicRemoveBtn.classList.remove('primary');
      magicRestoreBtn.classList.remove('primary');
      showToast('Magic brush disabled', 'info');
      return;
    }
    
    brushMode = mode;
    isDrawingMode = true;
    canvas.isDrawingMode = true;
    
    // Set brush color based on mode
    if (mode === 'remove') {
      canvas.freeDrawingBrush.width = 20;
      canvas.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.5)';
      magicRemoveBtn.classList.add('primary');
      magicRestoreBtn.classList.remove('primary');
      showToast('Magic Remove Brush activated - Draw over areas to remove', 'info');
    } else {
      canvas.freeDrawingBrush.width = 20;
      canvas.freeDrawingBrush.color = 'rgba(0, 255, 0, 0.5)';
      magicRemoveBtn.classList.remove('primary');
      magicRestoreBtn.classList.add('primary');
      showToast('Magic Restore Brush activated - Draw over areas to restore', 'info');
    }
    
    // Process the drawn path when mouse is released
    canvas.off('mouse:up'); // Remove previous listeners
    canvas.on('mouse:up', function() {
      if (!isDrawingMode) return;
      
      const paths = canvas.getObjects('path');
      if (paths.length === 0) return;
      
      showLoading(mode === 'remove' ? 'Removing area...' : 'Restoring area...');
      
      setTimeout(() => {
        try {
          // Get the current image
          const mainImage = canvas.item(0);
          if (!mainImage) {
            hideLoading();
            return;
          }
          
          // Create a temporary canvas
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          
          // Draw the current state
          tempCtx.drawImage(canvas.toCanvasElement(), 0, 0);
          
          // Get image data
          const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          const data = imageData.data;
          
          // For each path, process the pixels
          paths.forEach(path => {
            const pathLeft = path.left;
            const pathTop = path.top;
            const pathWidth = path.width;
            const pathHeight = path.height;
            
            // Create a mask canvas for the path
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = tempCanvas.width;
            maskCanvas.height = tempCanvas.height;
            const maskCtx = maskCanvas.getContext('2d');
            
            // Draw the path on the mask
            path.clone(function(clonedPath) {
              maskCtx.fillStyle = 'white';
              maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
              maskCtx.globalCompositeOperation = 'destination-out';
              clonedPath.set({
                fill: 'black',
                stroke: 'black'
              });
              maskCtx.drawImage(canvas.toCanvasElement(), 0, 0);
            });
            
            // Get mask data
            const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
            
            // Apply the effect based on the mode
            if (mode === 'remove') {
              // Make pixels transparent where the path was drawn
              for (let i = 0; i < data.length; i += 4) {
                if (maskData[i + 3] < 128) { // If mask is transparent (path area)
                  data[i + 3] = 0; // Make pixel transparent
                }
              }
            } else { // restore mode
              // Restore original image data where the path was drawn
              const originalImg = new Image();
              originalImg.src = originalImageData;
              
              const origCanvas = document.createElement('canvas');
              origCanvas.width = tempCanvas.width;
              origCanvas.height = tempCanvas.height;
              const origCtx = origCanvas.getContext('2d');
              
              origCtx.drawImage(originalImg, 0, 0, origCanvas.width, origCanvas.height);
              const origData = origCtx.getImageData(0, 0, origCanvas.width, origCanvas.height).data;
              
              for (let i = 0; i < data.length; i += 4) {
                if (maskData[i + 3] < 128) { // If mask is transparent (path area)
                  data[i] = origData[i]; // R
                  data[i + 1] = origData[i + 1]; // G
                  data[i + 2] = origData[i + 2]; // B
                  data[i + 3] = origData[i + 3]; // A
                }
              }
            }
          });
          
          // Put the modified image data back
          tempCtx.putImageData(imageData, 0, 0);
          
          // Replace the image on the canvas
          fabric.Image.fromURL(tempCanvas.toDataURL(), newImg => {
            canvas.clear();
            
            // Scale image to fit canvas
            const scale = Math.min(
              canvas.width / newImg.width,
              canvas.height / newImg.height
            ) * 0.9;
            
            newImg.scale(scale);
            
            // Center image
            newImg.set({
              left: canvas.width / 2,
              top: canvas.height / 2,
              originX: 'center',
              originY: 'center'
            });
            
            canvas.add(newImg);
            
            // Clear paths
            paths.forEach(path => canvas.remove(path));
            
            canvas.renderAll();
            updateEditedImage();
            
            hideLoading();
            showToast(mode === 'remove' ? 'Area removed successfully' : 'Area restored successfully', 'success');
          }, null, {
            crossOrigin: 'anonymous'
          });
        } catch (error) {
          console.error('Magic brush error:', error);
          hideLoading();
          showToast('Failed to process the brush action', 'error');
          
          // Clear paths
          const paths = canvas.getObjects('path');
          paths.forEach(path => canvas.remove(path));
          canvas.renderAll();
        }
      }, 500);
    });
  }
  
  // Add shadow to image
  function addShadow() {
    if (currentImageIndex === -1) {
      showToast('Please select an image first', 'error');
      return;
    }
    
    const activeObj = canvas.getActiveObject() || canvas.item(0);
    if (!activeObj) {
      showToast('No image found on canvas', 'error');
      return;
    }
    
    try {
      // Create a shadow object
      const shadow = new fabric.Shadow({
        color: 'rgba(0,0,0,0.5)',
        blur: 20,
        offsetX: 10,
        offsetY: 10
      });
      
      // Apply shadow to the object
      activeObj.set('shadow', shadow);
      
      canvas.renderAll();
      updateEditedImage();
      
      showToast('Shadow added successfully', 'success');
    } catch (error) {
      console.error('Shadow error:', error);
      showToast('Failed to add shadow', 'error');
    }
  }
  
  // Blur background (improved implementation)
  function blurBackground() {
    if (currentImageIndex === -1) {
      showToast('Please select an image first', 'error');
      return;
    }
    
    showLoading('Blurring background...');
    
    const activeObj = canvas.getActiveObject() || canvas.item(0);
    if (!activeObj) {
      hideLoading();
      showToast('No image found on canvas', 'error');
      return;
    }
    
    setTimeout(() => {
      try {
        // Create a temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = activeObj.width * activeObj.scaleX;
        tempCanvas.height = activeObj.height * activeObj.scaleY;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw the image
        const img = new Image();
        img.src = images[currentImageIndex].edited;
        
        img.onload = function() {
          // First, apply a blur filter to the entire image
          tempCtx.filter = 'blur(5px)';
          tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
          
          // Then, detect foreground (non-transparent areas) and keep them sharp
          const blurredData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          
          // Reset filter and redraw the original image
          tempCtx.filter = 'none';
          tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
          tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
          
          // Get the original image data
          const originalData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          
          // Combine: use original data for foreground (alpha > 200), blurred for background
          const combinedData = new ImageData(
            new Uint8ClampedArray(originalData.data),
            originalData.width,
            originalData.height
          );
          
          for (let i = 0; i < originalData.data.length; i += 4) {
            // If pixel is semi-transparent (likely background)
            if (originalData.data[i + 3] < 200) {
              combinedData.data[i] = blurredData.data[i]; // R
              combinedData.data[i + 1] = blurredData.data[i + 1]; // G
              combinedData.data[i + 2] = blurredData.data[i + 2]; // B
            }
          }
          
          // Put the combined data back
          tempCtx.putImageData(combinedData, 0, 0);
          
          // Replace the image on the canvas
          fabric.Image.fromURL(tempCanvas.toDataURL(), newImg => {
            canvas.clear();
            
            // Scale image to fit canvas
            const scale = Math.min(
              canvas.width / newImg.width,
              canvas.height / newImg.height
            ) * 0.9;
            
            newImg.scale(scale);
            
            // Center image
            newImg.set({
              left: canvas.width / 2,
              top: canvas.height / 2,
              originX: 'center',
              originY: 'center'
            });
            
            canvas.add(newImg);
            canvas.renderAll();
            
            updateEditedImage();
            
            hideLoading();
            showToast('Background blurred successfully', 'success');
          }, null, {
            crossOrigin: 'anonymous'
          });
        };
        
        img.onerror = function() {
          hideLoading();
          showToast('Failed to process image', 'error');
        };
      } catch (error) {
        console.error('Blur background error:', error);
        hideLoading();
        showToast('Failed to blur background', 'error');
      }
    }, 1000);
  }
  
  // Update the edited image in our images array
  function updateEditedImage() {
    if (currentImageIndex === -1) return;
    
    try {
      images[currentImageIndex].edited = canvas.toDataURL({
        format: 'png',
        quality: 1
      });
      
      // Update thumbnail
      const thumbnails = document.querySelectorAll('.thumbnail');
      if (thumbnails[currentImageIndex]) {
        thumbnails[currentImageIndex].src = images[currentImageIndex].edited;
      }
    } catch (error) {
      console.error('Update edited image error:', error);
      showToast('Failed to update image', 'error');
    }
  }
  
  // Download all edited images
  function downloadImages() {
    if (images.length === 0) {
      showToast('No images to download', 'error');
      return;
    }
    
    showLoading('Preparing download...');
    
    try {
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
            showToast('Image downloaded successfully', 'success');
          })
          .catch(err => {
            console.error('Download error:', err);
            hideLoading();
            showToast('Failed to download image', 'error');
          });
        return;
      }
      
      // For multiple images, create a zip file
      const zip = new JSZip();
      let processedCount = 0;
      
      images.forEach((image, index) => {
        // Convert data URL to blob
        fetch(image.edited)
          .then(res => res.blob())
          .then(blob => {
            // Add to zip
            zip.file('edited_' + image.filename, blob);
            
            processedCount++;
            if (processedCount === images.length) {
              // Generate zip file
              zip.generateAsync({ type: 'blob' })
                .then(content => {
                  // Download zip
                  saveAs(content, 'edited_images.zip');
                  hideLoading();
                  showToast('Images downloaded as ZIP', 'success');
                })
                .catch(err => {
                  console.error('Zip generation error:', err);
                  hideLoading();
                  showToast('Failed to create ZIP file', 'error');
                });
            }
          })
          .catch(err => {
            console.error('Blob conversion error:', err);
            processedCount++;
            if (processedCount === images.length) {
              hideLoading();
              showToast('Some images could not be processed', 'error');
            }
          });
      });
    } catch (error) {
      console.error('Download error:', error);
      hideLoading();
      showToast('Failed to download images', 'error');
    }
  }
  
  // Reset the editor
  function resetEditor() {
    if (images.length === 0) {
      showToast('No images to reset', 'info');
      return;
    }
    
    // If an image is selected, reset just that image
    if (currentImageIndex !== -1) {
      showLoading('Resetting image...');
      
      // Reset to original
      images[currentImageIndex].edited = images[currentImageIndex].original;
      
      // Update thumbnail
      const thumbnails = document.querySelectorAll('.thumbnail');
      if (thumbnails[currentImageIndex]) {
        thumbnails[currentImageIndex].src = images[currentImageIndex].original;
      }
      
      // Reload image to canvas
      fabric.Image.fromURL(images[currentImageIndex].original, img => {
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
        
        hideLoading();
        showToast('Image reset to original', 'success');
      }, null, {
        crossOrigin: 'anonymous'
      });
    } else {
      // Reset everything
      canvas.clear();
      images = [];
      currentImageIndex = -1;
      thumbnailsContainer.innerHTML = '';
      imageUpload.value = '';
      showToast('Editor reset successfully', 'info');
    }
  }
  
  // Set up event listeners
  imageUpload.addEventListener('change', handleImageUpload);
  removeBgBtn.addEventListener('click', removeBackground);
  magicRemoveBtn.addEventListener('click', () => setMagicBrushMode('remove'));
  magicRestoreBtn.addEventListener('click', () => setMagicBrushMode('restore'));
  addShadowBtn.addEventListener('click', addShadow);
  blurBgBtn.addEventListener('click', blurBackground);
  downloadBtn.addEventListener('click', downloadImages);
  resetBtn.addEventListener('click', resetEditor);
  
  // Add keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Ctrl+Z for undo (not implemented yet)
    if (e.ctrlKey && e.key === 'z') {
      // Future implementation
    }
    
    // Escape to exit drawing mode
    if (e.key === 'Escape' && isDrawingMode) {
      isDrawingMode = false;
      canvas.isDrawingMode = false;
      magicRemoveBtn.classList.remove('primary');
      magicRestoreBtn.classList.remove('primary');
      showToast('Magic brush disabled', 'info');
    }
  });
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded');
  
  // Force hide the loading overlay immediately
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
    console.log('Loading overlay hidden with inline style');
  }
  
  // Initialize the app
  init();
});

// Add a window load event as a fallback
window.addEventListener('load', () => {
  console.log('Window fully loaded');
  
  // Force hide the loading overlay again as a fallback
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
    console.log('Loading overlay hidden with inline style (window load)');
  }
});
