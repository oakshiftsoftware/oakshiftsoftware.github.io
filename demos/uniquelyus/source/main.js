const courseDataUrl = "https://uniquely-us.co.uk/source/data/courses.json";
const SHOW_BIRTHDAY_ANNIVERSARY_ANIMATION = true;

function initBirthdayCelebration() {
    if (!SHOW_BIRTHDAY_ANNIVERSARY_ANIMATION) return;

    const container = document.getElementById('birthday-celebration-root');
    if (!container || container.dataset.initialized === 'true') return;

    container.innerHTML = `
        <div class="birthday-celebration-badge">
            <i class="birthday-icon fa-solid fa-cake-candles"></i>
            <span>1 Year Anniversary</span>
            <i class="birthday-icon fa-solid fa-gift"></i>
        </div>
    `;

    const confettiLayer = document.createElement('div');
    confettiLayer.className = 'birthday-confetti-layer';

    const confettiItems = [
        'fa-solid fa-cake-candles',
        'fa-solid fa-gift',
        'fa-solid fa-star',
        'fa-solid fa-heart',
        'fa-solid fa-burst',
        'fa-solid fa-champagne-glasses'
    ];
    for (let index = 0; index < 18; index += 1) {
        const piece = document.createElement('span');
        piece.className = 'birthday-confetti-piece';
        piece.innerHTML = `<i class="${confettiItems[index % confettiItems.length]}"></i>`;
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.top = `-${Math.random() * 20 + 10}px`;
        piece.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 220}px`);
        piece.style.animationDuration = `${Math.random() * 3 + 3}s`;
        piece.style.animationDelay = `${Math.random() * 0.6}s`;
        confettiLayer.appendChild(piece);
    }

    container.appendChild(confettiLayer);
    container.dataset.initialized = 'true';
}

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

    async loadCourses() {
        const coursesGrid = document.getElementById('courses-grid');
        if (!coursesGrid) return;

        const getIconClass = (title) => 'fa-solid fa-hashtag';

        try {
            const response = await fetch(courseDataUrl);
            if (!response.ok) {
                throw new Error(`Unable to load course data (${response.status})`);
            }

            const payload = await response.json();
            const courses = Array.isArray(payload) ? payload : (payload.courses || []);

            coursesGrid.innerHTML = courses.map(course => {
                let cta = '';
                
                const isCourseFull = Number(course.full_course_spaces) === 0;
                const fullCoursePrice = Number(course.full_course_price ?? 0);
                const isSingleSessionFull = Number(course.single_session_spaces) === 0;
                const singleSessionPrice = Number(course.single_session_price ?? 0);

                if (isCourseFull) {
                    cta = `<button class="enroll-btn disabled" disabled>Fully Booked</button>`;
                } else if (course.url) {
                    cta = `<a class="enroll-btn" href="${course.url}" target="_blank" rel="noopener noreferrer">Enroll Now</a>`;
                } else {
                    cta = `<button class="enroll-btn" onclick="enrollCourse('${course.title}')">Enroll Now</button>`;
                }

                let pricingInfo = '';

                if (course.course_type === 'crochet') {
                    pricingInfo = `
                            <div class="course-meta">
                                <span>Full Course Spaces: ${course.full_course_spaces}</span>
                                <span class="course-price">£${Number.isFinite(fullCoursePrice) ? fullCoursePrice.toFixed(2) : '0.00'}</span>
                            </div>
                    `;
                } else if (course.course_type === 'craft' || course.course_type === 'painting') {
                    pricingInfo = `
                            <div class="course-meta">
                                <span>Full Course Spaces: ${course.full_course_spaces}</span>
                                <span class="course-price">£${Number.isFinite(fullCoursePrice) ? fullCoursePrice.toFixed(2) : '0.00'}</span>
                            </div>
                            <div class="course-meta">
                                <span>Single Session Spaces: ${course.single_session_spaces}</span>
                                <span class="course-price">£${Number.isFinite(singleSessionPrice) ? singleSessionPrice.toFixed(2) : '0.00'}</span>
                            </div>
                    `;
                } else if (course.course_type === 'one-off') {
                    pricingInfo = `
                            <div class="course-meta">
                                <span>Single Session Spaces: ${course.single_session_spaces}</span>
                                <span class="course-price">£${Number.isFinite(singleSessionPrice) ? singleSessionPrice.toFixed(2) : '0.00'}</span>
                            </div>
                    `;
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
                                Duration: ${course.weeks} weeks<br><br>
                                <i>${course.description || 'No description available.'}</i>
                            </p>
                            ${pricingInfo}
                            ${cta}
                        </div>
                    </div>`;
            }).join('');
        } catch (error) {
            console.error('Unable to load courses from JSON:', error);
            coursesGrid.innerHTML = '<p class="course-error">Unable to load courses right now.</p>';
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    new Router();
    initBirthdayCelebration();
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
