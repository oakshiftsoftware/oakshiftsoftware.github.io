class Router {
    constructor() {
        this.pages = {
            '': 'home',
            'courses': 'courses',
            'about': 'about',
            'contact': 'contact',
            'gallery': 'gallery'
        };
        this.init();
    }

    init() {
        window.addEventListener('hashchange', () => this.navigate());
        this.navigate();
    }

    navigate() {
        const hash = window.location.hash.slice(1) || '';
        const pageId = this.pages[hash];

        if (!pageId) {
            window.location.hash = '#';
            return;
        }

        this.renderPage(pageId);
        this.updateNavigation(hash);
    }

    renderPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        const page = document.getElementById(pageId);
        if (page) {
            page.classList.add('active');

            if (pageId === 'courses') {
                this.loadCourses();
            }

            if (pageId === 'gallery') {
                this.loadGallery();
            }
        }

        window.scrollTo(0, 0);
    }

    updateNavigation(hash) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + hash) {
                link.classList.add('active');
            }
        });
    }

    loadCourses() {
        const coursesGrid = document.getElementById('courses-grid');
        const getIconClass = (title) => 'fa-solid fa-hashtag';
        coursesGrid.innerHTML = coursesData.map(course => {
            let cta = '';
            const isFull = Number(course.spaces) === 0;

            if (isFull) {
                cta = `<button class="enroll-btn disabled" disabled>Fully Booked</button>`;
            } else if (course.url) {
                cta = `<a class="enroll-btn" href="${course.url}" target="_blank" rel="noopener noreferrer">Enroll Now</a>`;
            } else {
                cta = `<button class="enroll-btn" onclick="enrollCourse('${course.title}')">Enroll Now</button>`;
            }

            return `
                <div class="course-card">
                    <div class="course-image">
                        <span style="margin-left: 10px;">
                            <i class="${getIconClass(course.title)}" style="font-weight: normal;"></i>
                            <span>${course.id}</span>
                        </span>
                    </div>
                    <div class="course-content">
                        <h3>${course.title}</h3>
                        <p class="course-description">
                            ID: ${course.id}<br>
                            Duration: ${course.weeks} weeks
                        </p>
                        <div class="course-meta">
                            <span>Spaces: ${course.spaces}</span>
                            <span class="course-price">£${course.price.toFixed(2)}</span>
                        </div>
                        ${cta}
                    </div>
                </div>`;
        }).join('');
    }
}


document.addEventListener('DOMContentLoaded', () => {
    new Router();
});


const sourceDomain = "https://oakshiftsoftware.github.io/demos/uniquelyus";
const eventDir = `${sourceDomain}/source/data`;
const galleryDir = `${sourceDomain}/source/images/gallery`;


// Events
const eventsUrl = `${eventDir}/events.json`;
const eventConstants = {
    disclaimer: "<i>I'm not a professional artist, I'm a craft instructor. So I hope this will put your mind at rest that we're all learning and in the same boat. Any questions please contact me directly.</i>"
};


// Gallery
const galleryList = [
    "19610.jpg", "21644.jpg", "22443.jpg", "22623.jpg", "22785.jpg", "22796.jpg", 
    "22898.jpg", "22987.jpg", "23037.jpg", "23081.jpg", "23152.jpg", "23173.jpg", 
    "23362.jpg", "23496.jpg", "27195.jpg", "31515.jpg", "31911.jpg", "32047.jpg",
    "32078.jpg", "32282.jpg", "32283.jpg", "32285.jpg", "32392.jpg", "32626.jpg",
    "32656.jpg", "32693.jpg", "32750.jpg", "32753.jpg", "32754.jpg", "32763.jpg",
    "32777.jpg", "32779.jpg", "32781.jpg", "32783.jpg", "32784.jpg", "32785.jpg",
    "34895.jpg", "34975.jpg", "34977.jpg", "34979.jpg", "34981.jpg", "34982.jpg",
    "35097.jpg", "35250.jpg", "35756.jpg"
];

const galleryState = {
    batchSize: 10,
    currentIndex: 0,
    initialized: false,
    clickHandlerSet: false
};

Router.prototype.loadGallery = function () {
    const page = document.getElementById('gallery');
    if (!page) return;

    const container = page.querySelector('.container');
    if (!container) return;

    if (!galleryState.initialized) {
        galleryState.currentIndex = 0;

        let grid = document.getElementById('gallery-grid');
        if (!grid) {
            grid = document.createElement('div');
            grid.id = 'gallery-grid';
            grid.className = 'gallery-grid';
            container.appendChild(grid);
        } else {
            grid.innerHTML = '';
        }

        let controls = document.getElementById('gallery-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.id = 'gallery-controls';
            controls.className = 'gallery-controls';
            controls.innerHTML = `<button id="load-more-gallery" class="submit-btn">Load more images</button>`;
            container.appendChild(controls);
        }

        const loadMoreButton = document.getElementById('load-more-gallery');
        loadMoreButton.addEventListener('click', () => {
            appendGalleryBatch(grid, loadMoreButton);
        });

        if (!document.getElementById('gallery-modal')) {
            const modal = document.createElement('div');
            modal.id = 'gallery-modal';
            modal.className = 'gallery-modal';
            modal.innerHTML = `
                <div class="gallery-modal-inner">
                    <button class="gallery-close" aria-label="Close">&times;</button>
                    <img id="gallery-modal-img" src="" alt="">
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('.gallery-close').addEventListener('click', () => {
                modal.classList.remove('open');
                document.getElementById('gallery-modal-img').src = '';
            });
        }

        if (!galleryState.clickHandlerSet) {
            grid.addEventListener('click', (e) => {
                const img = e.target.closest('img');
                if (!img) return;
                const modal = document.getElementById('gallery-modal');
                const modalImg = document.getElementById('gallery-modal-img');
                modalImg.src = img.dataset.src || img.src;
                modal.classList.add('open');
            });
            galleryState.clickHandlerSet = true;
        }

        appendGalleryBatch(grid, document.getElementById('load-more-gallery'));
        galleryState.initialized = true;
    }
};

function appendGalleryBatch(grid, loadMoreButton) {
    const endIndex = Math.min(galleryState.currentIndex + galleryState.batchSize, galleryList.length);
    const fragment = document.createDocumentFragment();

    for (let i = galleryState.currentIndex; i < endIndex; i++) {
        const imageName = galleryList[i];
        const imageUrl = `${galleryDir}/${imageName}`;
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `<img loading="lazy" src="${imageUrl}" alt="Gallery image">`;
        fragment.appendChild(item);
    }

    grid.appendChild(fragment);
    galleryState.currentIndex = endIndex;

    if (galleryState.currentIndex >= galleryList.length) {
        loadMoreButton.style.display = 'none';
    }
}
