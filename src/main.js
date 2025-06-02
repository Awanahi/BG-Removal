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
  
  // Production-ready background removal
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
          
          // Apply production-ready background removal
          removeBackgroundPro(imageData, tempCanvas.width, tempCanvas.height);
          
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
    }, 500);
  }
  
  // Production-ready background removal algorithm
  function removeBackgroundPro(imageData, width, height) {
    const data = imageData.data;
    
    // Step 1: Create a binary mask for the image
    const mask = createInitialMask(data, width, height);
    
    // Step 2: Apply GrabCut-inspired segmentation
    refineSegmentation(mask, data, width, height);
    
    // Step 3: Apply the mask to the image
    applyMaskToImage(mask, data, width, height);
    
    // Step 4: Post-process the result
    postProcessResult(data, width, height);
  }
  
  // Create initial mask using color-based segmentation
  function createInitialMask(data, width, height) {
    const totalPixels = width * height;
    const mask = new Uint8Array(totalPixels);
    
    // First pass: Mark edges as background
    const edgeWidth = Math.max(10, Math.floor(Math.min(width, height) * 0.03));
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x);
        
        // Mark edges as definite background (0)
        if (x < edgeWidth || x >= width - edgeWidth || 
            y < edgeWidth || y >= height - edgeWidth) {
          mask[idx] = 0; // Definite background
        } else {
          mask[idx] = 2; // Probable foreground
        }
      }
    }
    
    // Second pass: Detect likely background based on color similarity to edges
    const edgeColors = sampleEdgeColors(data, width, height, edgeWidth);
    
    for (let i = 0; i < totalPixels; i++) {
      if (mask[i] === 0) continue; // Skip already marked background
      
      const pixelIdx = i * 4;
      const pixelColor = {
        r: data[pixelIdx],
        g: data[pixelIdx + 1],
        b: data[pixelIdx + 2]
      };
      
      // Check if pixel is similar to edge colors
      for (const edgeColor of edgeColors) {
        const colorDistance = getColorDistance(pixelColor, edgeColor);
        if (colorDistance < 30) {
          mask[i] = 0; // Mark as background
          break;
        }
      }
    }
    
    // Third pass: Detect clothing and text
    detectClothingAndText(mask, data, width, height);
    
    return mask;
  }
  
  // Sample colors from the edges of the image
  function sampleEdgeColors(data, width, height, edgeWidth) {
    const edgeColors = [];
    const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 30));
    
    // Sample top and bottom edges
    for (let x = 0; x < width; x += sampleStep) {
      // Top edge
      for (let y = 0; y < edgeWidth; y += sampleStep) {
        const idx = (y * width + x) * 4;
        edgeColors.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2]
        });
      }
      
      // Bottom edge
      for (let y = height - edgeWidth; y < height; y += sampleStep) {
        const idx = (y * width + x) * 4;
        edgeColors.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2]
        });
      }
    }
    
    // Sample left and right edges
    for (let y = edgeWidth; y < height - edgeWidth; y += sampleStep) {
      // Left edge
      for (let x = 0; x < edgeWidth; x += sampleStep) {
        const idx = (y * width + x) * 4;
        edgeColors.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2]
        });
      }
      
      // Right edge
      for (let x = width - edgeWidth; x < width; x += sampleStep) {
        const idx = (y * width + x) * 4;
        edgeColors.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2]
        });
      }
    }
    
    // Cluster the edge colors to find dominant colors
    return clusterColors(edgeColors, 30);
  }
  
  // Cluster colors to find dominant colors
  function clusterColors(colors, threshold = 25, maxClusters = 5) {
    if (colors.length === 0) return [];
    
    const clusters = [];
    
    for (const color of colors) {
      let foundCluster = false;
      
      for (const cluster of clusters) {
        const distance = getColorDistance(color, cluster.center);
        if (distance < threshold) {
          // Add to existing cluster
          cluster.colors.push(color);
          cluster.count++;
          
          // Update center (average)
          cluster.center = {
            r: Math.round((cluster.center.r * (cluster.count - 1) + color.r) / cluster.count),
            g: Math.round((cluster.center.g * (cluster.count - 1) + color.g) / cluster.count),
            b: Math.round((cluster.center.b * (cluster.count - 1) + color.b) / cluster.count)
          };
          
          foundCluster = true;
          break;
        }
      }
      
      if (!foundCluster) {
        // Create new cluster
        clusters.push({
          center: { ...color },
          colors: [color],
          count: 1
        });
      }
    }
    
    // Sort clusters by count (descending)
    clusters.sort((a, b) => b.count - a.count);
    
    // Return centers of the top clusters
    return clusters.slice(0, maxClusters).map(cluster => cluster.center);
  }
  
  // Calculate Euclidean distance between two colors
  function getColorDistance(color1, color2) {
    const rDiff = color1.r - color2.r;
    const gDiff = color1.g - color2.g;
    const bDiff = color1.b - color2.b;
    
    return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
  }
  
  // Detect clothing and text in the image
  function detectClothingAndText(mask, data, width, height) {
    const totalPixels = width * height;
    
    // Detect high contrast areas (likely text)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (mask[i] === 0) continue; // Skip background
        
        const idx = i * 4;
        const centerColor = {
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2]
        };
        
        // Check contrast with neighbors
        let highContrast = false;
        
        // Check 8-connected neighbors
        for (let dy = -1; dy <= 1 && !highContrast; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            
            const ni = ny * width + nx;
            const nidx = ni * 4;
            
            const neighborColor = {
              r: data[nidx],
              g: data[nidx + 1],
              b: data[nidx + 2]
            };
            
            const contrast = getColorDistance(centerColor, neighborColor);
            if (contrast > 60) { // High contrast threshold
              highContrast = true;
              break;
            }
          }
        }
        
        if (highContrast) {
          mask[i] = 3; // Definite foreground (text)
          
          // Mark surrounding pixels as probable foreground
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              
              const ni = ny * width + nx;
              if (mask[ni] !== 3) { // Don't downgrade definite foreground
                mask[ni] = 2; // Probable foreground
              }
            }
          }
        }
      }
    }
    
    // Detect uniform color regions (likely clothing)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i] === 0 || mask[i] === 3) continue; // Skip background and text
        
        if (isPartOfUniformRegion(data, x, y, width, height)) {
          mask[i] = 3; // Definite foreground (clothing)
        }
      }
    }
    
    // Connect foreground regions
    connectForegroundRegions(mask, width, height);
  }
  
  // Check if pixel is part of a uniform color region
  function isPartOfUniformRegion(data, x, y, width, height) {
    const idx = (y * width + x) * 4;
    const centerColor = {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2]
    };
    
    const radius = 5;
    let similarCount = 0;
    let totalChecked = 0;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        
        const nidx = (ny * width + nx) * 4;
        totalChecked++;
        
        const neighborColor = {
          r: data[nidx],
          g: data[nidx + 1],
          b: data[nidx + 2]
        };
        
        const colorDistance = getColorDistance(centerColor, neighborColor);
        if (colorDistance < 20) { // Similar color threshold
          similarCount++;
        }
      }
    }
    
    // If more than 75% of neighbors have similar color, it's a uniform region
    return totalChecked > 0 && similarCount / totalChecked > 0.75;
  }
  
  // Connect foreground regions to avoid holes
  function connectForegroundRegions(mask, width, height) {
    const tempMask = new Uint8Array(mask);
    
    // Dilate definite foreground
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        
        if (tempMask[i] !== 3) continue; // Only dilate definite foreground
        
        // Mark 4-connected neighbors as foreground
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          
          const ni = ny * width + nx;
          if (tempMask[ni] !== 0) { // Don't convert definite background
            mask[ni] = 2; // Probable foreground
          }
        }
      }
    }
    
    // Fill holes in foreground
    fillHoles(mask, width, height);
  }
  
  // Fill small holes in the foreground
  function fillHoles(mask, width, height) {
    const totalPixels = width * height;
    const visited = new Uint8Array(totalPixels);
    
    // Find connected background regions
    for (let i = 0; i < totalPixels; i++) {
      if (visited[i] || mask[i] !== 0) continue;
      
      const region = [];
      const queue = [i];
      visited[i] = 1;
      
      let touchesEdge = false;
      
      while (queue.length > 0) {
        const current = queue.shift();
        region.push(current);
        
        const x = current % width;
        const y = Math.floor(current / width);
        
        // Check if region touches the edge
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          touchesEdge = true;
        }
        
        // Check 4-connected neighbors
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          
          const ni = ny * width + nx;
          
          if (!visited[ni] && mask[ni] === 0) {
            visited[ni] = 1;
            queue.push(ni);
          }
        }
      }
      
      // If region doesn't touch the edge and is small, fill it
      if (!touchesEdge && region.length < 1000) {
        for (const idx of region) {
          mask[idx] = 2; // Convert to probable foreground
        }
      }
    }
  }
  
  // Refine segmentation using GrabCut-inspired approach
  function refineSegmentation(mask, data, width, height) {
    const totalPixels = width * height;
    
    // Build color models for foreground and background
    const fgColors = [];
    const bgColors = [];
    
    for (let i = 0; i < totalPixels; i++) {
      const pixelIdx = i * 4;
      const color = {
        r: data[pixelIdx],
        g: data[pixelIdx + 1],
        b: data[pixelIdx + 2]
      };
      
      if (mask[i] === 3) { // Definite foreground
        fgColors.push(color);
      } else if (mask[i] === 0) { // Definite background
        bgColors.push(color);
      }
    }
    
    // Cluster foreground and background colors
    const fgClusters = clusterColors(fgColors, 25, 10);
    const bgClusters = clusterColors(bgColors, 25, 10);
    
    // Refine probable regions based on color models
    for (let i = 0; i < totalPixels; i++) {
      if (mask[i] !== 2) continue; // Only process probable regions
      
      const pixelIdx = i * 4;
      const color = {
        r: data[pixelIdx],
        g: data[pixelIdx + 1],
        b: data[pixelIdx + 2]
      };
      
      // Find distance to nearest foreground and background cluster
      let minFgDist = Infinity;
      let minBgDist = Infinity;
      
      for (const cluster of fgClusters) {
        const dist = getColorDistance(color, cluster);
        minFgDist = Math.min(minFgDist, dist);
      }
      
      for (const cluster of bgClusters) {
        const dist = getColorDistance(color, cluster);
        minBgDist = Math.min(minBgDist, dist);
      }
      
      // Assign based on color similarity
      if (minFgDist < minBgDist) {
        mask[i] = 3; // Definite foreground
      } else {
        mask[i] = 0; // Definite background
      }
    }
    
    // Apply spatial coherence
    applySpatialCoherence(mask, data, width, height);
  }
  
  // Apply spatial coherence to ensure smooth regions
  function applySpatialCoherence(mask, data, width, height) {
    const tempMask = new Uint8Array(mask);
    
    // Smooth the mask using a voting scheme
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        
        // Skip definite foreground and background
        if (tempMask[i] === 3 || tempMask[i] === 0) continue;
        
        let fgCount = 0;
        let bgCount = 0;
        
        // Count foreground and background neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            
            const ni = ny * width + nx;
            
            if (tempMask[ni] === 3) {
              fgCount++;
            } else if (tempMask[ni] === 0) {
              bgCount++;
            }
          }
        }
        
        // Assign based on majority vote
        if (fgCount > bgCount) {
          mask[i] = 3; // Foreground
        } else if (bgCount > fgCount) {
          mask[i] = 0; // Background
        } else {
          // If tied, use color similarity
          const pixelIdx = i * 4;
          const color = {
            r: data[pixelIdx],
            g: data[pixelIdx + 1],
            b: data[pixelIdx + 2]
          };
          
          let fgSimilarity = 0;
          let bgSimilarity = 0;
          
          // Calculate color similarity to neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              
              const ni = ny * width + nx;
              const nidx = ni * 4;
              
              const neighborColor = {
                r: data[nidx],
                g: data[nidx + 1],
                b: data[nidx + 2]
              };
              
              const similarity = 255 - getColorDistance(color, neighborColor);
              
              if (tempMask[ni] === 3) {
                fgSimilarity += similarity;
              } else if (tempMask[ni] === 0) {
                bgSimilarity += similarity;
              }
            }
          }
          
          if (fgSimilarity > bgSimilarity) {
            mask[i] = 3; // Foreground
          } else {
            mask[i] = 0; // Background
          }
        }
      }
    }
  }
  
  // Apply the mask to the image
  function applyMaskToImage(mask, data, width, height) {
    const totalPixels = width * height;
    
    for (let i = 0; i < totalPixels; i++) {
      const pixelIdx = i * 4;
      
      if (mask[i] === 0) { // Background
        data[pixelIdx + 3] = 0; // Make transparent
      }
    }
  }
  
  // Post-process the result for clean edges
  function postProcessResult(data, width, height) {
    const totalPixels = width * height;
    
    // Create a binary mask of transparent pixels
    const transparentMask = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      transparentMask[i] = data[i * 4 + 3] === 0 ? 1 : 0;
    }
    
    // Remove small transparent and opaque regions
    removeSmallRegions(transparentMask, data, width, height);
    
    // Smooth edges
    smoothEdges(data, width, height);
  }
  
  // Remove small regions for cleaner result
  function removeSmallRegions(transparentMask, data, width, height) {
    const totalPixels = width * height;
    const visited = new Uint8Array(totalPixels);
    
    // Find and process small transparent regions
    for (let i = 0; i < totalPixels; i++) {
      if (visited[i]) continue;
      
      const isTransparent = transparentMask[i] === 1;
      
      // Find connected region
      const region = [];
      const queue = [i];
      visited[i] = 1;
      
      let touchesEdge = false;
      
      while (queue.length > 0) {
        const current = queue.shift();
        region.push(current);
        
        const x = current % width;
        const y = Math.floor(current / width);
        
        // Check if region touches the edge
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          touchesEdge = true;
        }
        
        // Check 4-connected neighbors
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          
          const ni = ny * width + nx;
          
          if (!visited[ni] && transparentMask[ni] === (isTransparent ? 1 : 0)) {
            visited[ni] = 1;
            queue.push(ni);
          }
        }
      }
      
      // Process small regions
      const threshold = isTransparent ? 200 : 100; // Different thresholds for transparent and opaque
      
      if (!touchesEdge && region.length < threshold) {
        for (const idx of region) {
          const pixelIdx = idx * 4;
          if (isTransparent) {
            // Small transparent region -> make opaque
            data[pixelIdx + 3] = 255;
          } else {
            // Small opaque region -> make transparent
            data[pixelIdx + 3] = 0;
          }
        }
      }
    }
  }
  
  // Smooth edges for a more natural look
  function smoothEdges(data, width, height) {
    const totalPixels = width * height;
    const tempAlpha = new Uint8Array(totalPixels);
    
    // Copy alpha channel
    for (let i = 0; i < totalPixels; i++) {
      tempAlpha[i] = data[i * 4 + 3];
    }
    
    // Apply box blur to alpha channel at edges
    const radius = 1;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        
        // Only process edge pixels
        let isEdge = false;
        
        // Check if this pixel is at the edge of transparency
        for (let dy = -1; dy <= 1 && !isEdge; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            
            const ni = ny * width + nx;
            
            // If neighbor has different transparency, this is an edge
            if ((tempAlpha[i] === 0 && tempAlpha[ni] > 0) || 
                (tempAlpha[i] > 0 && tempAlpha[ni] === 0)) {
              isEdge = true;
              break;
            }
          }
        }
        
        // If not an edge pixel, skip
        if (!isEdge) continue;
        
        // Apply blur to edge pixel
        let sum = 0;
        let count = 0;
        
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            
            const ni = ny * width + nx;
            sum += tempAlpha[ni];
            count++;
          }
        }
        
        // Update alpha with blurred value
        data[i * 4 + 3] = Math.round(sum / count);
      }
    }
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
    }, 500);
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
