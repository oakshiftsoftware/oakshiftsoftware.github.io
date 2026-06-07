const services_list_url = "https://oakshiftsoftware.github.io/source/data/services.json";
const variants_url = "https://oakshiftsoftware.github.io/source/data/variants.json";
const discounts_url = "https://oakshiftsoftware.github.io/source/data/discounts.json";


let selectedServices = new Map();
let availableDiscounts = [];
let allServices = [];
let allVariants = [];


const PACKAGE_CACHE_KEY = 'oakshift_package_v1';
let currentReferenceCode = null;
let lastSavedContentKey = null;


function getPackageContentKey() {
    return Array.from(selectedServices.entries())
        .map(([code, sel]) => `${code}-${sel.variantKey}`)
        .sort()
        .join('|');
}


function randomToken(len = 8) {
    return Math.random().toString(36).substr(2, len).toUpperCase();
}


function savePackageCache() {
    try {
        const items = Array.from(selectedServices.entries()).map(([code, sel]) => ({
            code,
            serviceType: sel.serviceType,
            variantKey: sel.variantKey,
            price: sel.price,
            name: sel.name,
            isRecurring: sel.isRecurring
        }));

        const contentKey = getPackageContentKey();
        if (contentKey !== lastSavedContentKey) {
            currentReferenceCode = 'PKG-' + randomToken(8);
            lastSavedContentKey = contentKey;
        }

        const payload = {
            items,
            savedAt: Date.now(),
            referenceCode: currentReferenceCode,
            contentKey
        };
        localStorage.setItem(PACKAGE_CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.error('Error saving package cache', e);
    }
}


function loadPackageCache() {
    try {
        const raw = localStorage.getItem(PACKAGE_CACHE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.items)) return false;

        selectedServices = new Map(parsed.items.map(i => [i.code, {
            serviceType: i.serviceType,
            variantKey: i.variantKey,
            price: i.price,
            name: i.name,
            isRecurring: i.isRecurring
        }]));

        lastSavedContentKey = parsed.contentKey || '';
        const currentKey = getPackageContentKey();
        if (parsed.referenceCode && parsed.contentKey === currentKey) {
            currentReferenceCode = parsed.referenceCode;
        } else {
            currentReferenceCode = null;
        }

        return true;
    } catch (e) {
        console.error('Error loading package cache', e);
        return false;
    }
}


function clearPackageCache() {
    try {
        localStorage.removeItem(PACKAGE_CACHE_KEY);
    } catch (e) {
        console.error('Error clearing package cache', e);
    }
}


async function loadServiceData() {
    try {
        const [servicesResponse, variantsResponse] = await Promise.all([
            fetch(services_list_url),
            fetch(variants_url)
        ]);
        allServices = await servicesResponse.json();
        allVariants = await variantsResponse.json();
    } catch (error) {
        console.error('Error loading service data:', error);
    }
}


async function loadDiscounts() {
    try {
        if (allServices.length === 0 || allVariants.length === 0) {
            await loadServiceData();
        }
        const response = await fetch(discounts_url);
        const discounts = await response.json();
        displayDiscounts(discounts);
    } catch (error) {
        console.error('Error loading deals:', error);
        displayDiscountError();
    }
}


function getServiceDetails(serviceId) {
    const matches = serviceId.match(/([A-Z0-9]+)-([A-Z])/);
    if (!matches) return { name: 'Unknown Service' };

    const [, baseId, variantCode] = matches;
    const service = allServices.find(s => s.code === baseId);
    if (!service) return { name: 'Unknown Service' };

    const variantEntry = Object.entries(service.variants)
        .find(([key]) => key === variantCode);

    if (!variantEntry) return {
        name: service.name,
        isRecurring: false
    };

    const [, [variantName, price, isRecurring]] = variantEntry;
    return {
        name: service.name,
        variantName,
        price,
        isRecurring
    };
}


function displayDiscounts(discounts) {
    const grid = document.getElementById('discount-grid');
    grid.innerHTML = '';

    discounts.forEach(discount => {
        const card = document.createElement('div');
        card.className = 'discount-card';

        const discountedService = getServiceDetails(discount.discountedService);
        const discountedServiceText = discountedService.variantName ?
            `${discountedService.name} (${discountedService.variantName})` :
            discountedService.name;

        const requiredServices = discount.requiredServices.map(id => {
            const service = getServiceDetails(id);
            return service.variantName ?
                `${service.name} (${service.variantName})` :
                service.name;
        });

        const savingsText = discountedService.isRecurring ?
            `Save ${formatPrice(discount.value)}/mo` :
            `Save ${formatPrice(discount.value)}`;

        card.innerHTML = `
                        <h3>${discount.name}</h3>
                        <div class="discount-value">${savingsText}</div>
                        <p class="discount-description">
                            Get a deal on <strong>${discountedServiceText}</strong>
                            ${discountedService.isRecurring ? ' monthly fee' : ''}
                            when you combine it with these services:
                        </p>
                        <div class="discount-requirement">
                            <strong>Required Services:</strong>
                            <ul class="discount-service-list">
                                ${requiredServices.map(service => `<li>${service}</li>`).join('')}
                            </ul>
                        </div>
                    `;

        grid.appendChild(card);
    });
}


function displayDiscountError() {
    const grid = document.getElementById('discount-grid');
    grid.innerHTML = `
                    <div class="discount-card">
                        <h3>Error Loading Deals</h3>
                        <p class="discount-description">
                            We're having trouble loading the current deals. Please try again later.
                        </p>
                    </div>
                `;
}


document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.id === 'discounts' &&
                !mutation.target.classList.contains('hidden')) {
                loadDiscounts();
            }
        });
    });

    const discountsSection = document.getElementById('discounts');
    observer.observe(discountsSection, {
        attributes: true,
        attributeFilter: ['class']
    });

    document.addEventListener('click', (event) => {
        if (event.target.closest('.modal-content')) return;
        
        const variantItem = event.target.closest('.variant-item');
        if (variantItem) {
            const serviceData = variantItem.getAttribute('data-service-data');
            const variantKey = variantItem.getAttribute('data-variant-key');
            if (serviceData && variantKey) {
                try { showServiceModal(serviceData, variantKey); } catch (e) { console.error(e); }
            }
            return;
        }

        // Variant selector click (but not the radio input itself)
        const variantSelector = event.target.closest('.variant-selector');
        if (variantSelector && !event.target.matches('input[type="radio"]')) {
            const input = variantSelector.querySelector('input');
            if (input) {
                const serviceData = input.getAttribute('data-service-data');
                const variantKey = input.getAttribute('data-variant-key');
                if (serviceData && variantKey) {
                    try { showServiceModal(serviceData, variantKey); } catch (e) { console.error(e); }
                }
            }
            return;
        }
    });
});


function formatPrice(price) {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP'
    }).format(price);
}


function showServiceModal(serviceData, variantKey = null) {
    try {
        console.log('showServiceModal called', { serviceData, variantKey });
        
        const service = typeof serviceData === 'string' ? JSON.parse(serviceData) : serviceData;

        const modal = document.getElementById('service-modal');
        const title = document.getElementById('modal-title');
        const description = document.getElementById('modal-description');
        const featuresList = document.getElementById('modal-features');

        if (!modal || !title || !description || !featuresList) {
            console.error('Modal elements missing');
            return;
        }

        title.textContent = service.name || 'Service';
        description.textContent = service.description || '';

        featuresList.innerHTML = '';

        if (variantKey && service.variants && service.variants[variantKey]) {
            const [variantName, , , variantInfo] = service.variants[variantKey];
            title.textContent = `${service.name} - ${variantName}`;
            if (variantInfo && variantInfo.description) {
                description.textContent = variantInfo.description;

                if (variantInfo.features && Array.isArray(variantInfo.features)) {
                    variantInfo.features.forEach(feature => {
                        const li = document.createElement('li');
                        li.textContent = feature;
                        featuresList.appendChild(li);
                    });
                }
            }
        }

        modal.style.display = 'flex';
        
        setTimeout(() => modal.classList.remove('hidden'), 10);
    } catch (error) {
        console.error('Error showing modal:', error);
    }
}


function closeServiceModal() {
    const modal = document.getElementById('service-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}


document.addEventListener('click', (event) => {
    const modal = document.getElementById('service-modal');
    if (event.target === modal) {
        closeServiceModal();
    }
});


function createServiceCard(service, isBuilder = false) {
    const card = document.createElement('div');
    card.className = 'card service-card';

    const variantsList = Object.entries(service.variants)
        .map(([key, [name, price, isRecurring]]) => {
            const variantHtml = isBuilder ? `
                            <div class="variant-selector">
                                <input type="radio" 
                                    name="service_${service.code}" 
                                    value="${key}" 
                                    data-service="${service.code}"
                                    data-price="${price}"
                                    data-name="${name}"
                                    data-recurring="${isRecurring}"
                                    data-variant-key="${key}"
                                    data-service-data='${JSON.stringify(service)}'>
                                <span>${name}</span>
                                <span style="margin-left: auto">${formatPrice(price)}${isRecurring ? '/mo' : ''}</span>
                            </div>` : `
                            <div class="variant-item" data-variant-key="${key}" data-service-data='${JSON.stringify(service)}'>
                                <span>${name}</span>
                                <span>${formatPrice(price)}${isRecurring ? '/mo' : ''}</span>
                            </div>`;
            return variantHtml;
            if (isBuilder) {
                return `
                                <div class="variant-selector">
                                    <input type="radio" 
                                        name="service_${service.code}" 
                                        value="${key}" 
                                        data-service="${service.code}"
                                        data-price="${price}"
                                        data-name="${name}"
                                        data-recurring="${isRecurring}">
                                    <span>${name}</span>
                                    <span style="margin-left: auto">${formatPrice(price)}${isRecurring ? '/mo' : ''}</span>
                                </div>`;
            } else {
                return `
                                <div class="variant-item">
                                    <span>${name}</span>
                                    <span>${formatPrice(price)}${isRecurring ? '/mo' : ''}</span>
                                </div>`;
            }
        }).join('');

    card.innerHTML = `
                    <div class="service-header">
                        <span class="tag">${service.tag}</span><br /><br />
                        <h3>${service.name}</h3>
                    </div>
                    <div class="service-content">
                        <p>${service.description}</p>
                        <div class="service-variants">
                            ${variantsList}
                        </div>
                    </div>
                `;

    if (!isBuilder) {
        return card;
    }

    setTimeout(() => {
        const radioButtons = card.querySelectorAll('input[type="radio"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', handleServiceSelection);
        });
    }, 0);

    return card;
}


function createPackageBuilder(services) {
    const builder = document.createElement('div');
    builder.className = 'package-builder';

    const servicesSection = document.createElement('div');
    servicesSection.className = 'services-section';

    const coreServices = services.filter(s => s.category === 'Core');
    const optionalServices = services.filter(s => s.category === 'Optional');

    servicesSection.innerHTML = '<h3 style="margin-top: 1rem; margin-bottom: 1rem;">Core Services</h3>';
    const coreGrid = document.createElement('div');
    coreGrid.className = 'service-grid';

    coreServices.forEach(service => {
        const card = document.createElement('div');
        card.className = 'card service-card';

        const variantsList = Object.entries(service.variants)
            .map(([key, [name, price, isRecurring]]) => `
                            <label class="variant-selector">
                                <input type="radio" 
                                    name="service_${service.code}" 
                                    value="${key}" 
                                    data-service="${service.code}"
                                    data-service-type="Core"
                                    data-price="${price}"
                                    data-name="${service.name} - ${name}"
                                    data-recurring="${isRecurring}">
                                <span>${name}</span>
                                <span style="margin-left: auto">${formatPrice(price)}</span>
                            </label>
                        `).join('');

        card.innerHTML = `
                        <div class="service-header">
                            <span class="tag">${service.tag}</span><br /><br />
                            <h3>${service.name}</h3>
                        </div>
                        <div class="service-content">
                            <p>${service.description}</p>
                            <div class="service-variants">
                                ${variantsList}
                            </div>
                        </div>
                    `;
        coreGrid.appendChild(card);
    });
    servicesSection.appendChild(coreGrid);

    servicesSection.innerHTML += '<h3 style="margin-top: 1rem; margin-bottom: 1rem;">Optional Services</h3>';
    const optionalGrid = document.createElement('div');
    optionalGrid.className = 'service-grid';

    optionalServices.forEach(service => {
        const card = document.createElement('div');
        card.className = 'card service-card';

        const variantsList = Object.entries(service.variants)
            .map(([key, [name, price, isRecurring]]) => `
                            <label class="variant-selector">
                                <input type="radio" 
                                    name="service_${service.code}" 
                                    value="${key}" 
                                    data-service="${service.code}"
                                    data-service-type="Optional"
                                    data-price="${price}"
                                    data-name="${service.name} - ${name}"
                                    data-recurring="${isRecurring}"
                                    disabled>
                                <span>${name}</span>
                                <span style="margin-left: auto">${formatPrice(price)}${isRecurring ? '/mo' : ''}</span>
                            </label>
                        `).join('');

        card.innerHTML = `
                        <div class="service-header">
                            <span class="tag">${service.tag}</span><br /><br />
                            <h3>${service.name}</h3>
                        </div>
                        <div class="service-content">
                            <p>${service.description}</p>
                            <div class="service-variants">
                                ${variantsList}
                            </div>
                        </div>
                    `;
        optionalGrid.appendChild(card);
    });
    servicesSection.appendChild(optionalGrid);

    const summarySection = document.createElement('div');
    summarySection.className = 'package-summary';
    summarySection.innerHTML = `
                    <h3>Your Package</h3>
                    <div id="selected-services"></div>
                    <div class="package-total">
                        <div>One-time Setup Cost: <span id="package-total-amount">${formatPrice(0)}</span></div>
                        <div>Monthly Cost: <span id="package-recurring-amount">£0.00/mo</span></div>
                        <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
                            Initial Payment: <span id="package-initial-total"></span>
                            <div style="font-size: 0.8em; color: #888;">(Setup Cost + First Month)</div>
                        </div>
                    </div>
                    <div class="package-actions">
                        <button id="preview-package" class="package-action-button secondary" disabled>
                            Preview Quote
                        </button>
                        <button id="export-package" class="package-action-button primary" disabled>
                            Export PDF
                        </button>
                        <button id="clear-package-cache" class="package-action-button secondary" style="background:#fff;border:1px solid #e9ecef;color:var(--primary-color);">
                            Clear Saved Package
                        </button>
                    </div>
                `;

    builder.appendChild(servicesSection);
    builder.appendChild(summarySection);

    const allRadioButtons = builder.querySelectorAll('input[type="radio"]');
    allRadioButtons.forEach(radio => {
        radio.addEventListener('change', handleServiceSelection);
    });

    const clearBtn = summarySection.querySelector('#clear-package-cache');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear the saved package from cache? This will also clear your current selections.')) {
                clearPackageCache();
                selectedServices.clear();
                
                const radios = builder.querySelectorAll('input[type="radio"]');
                radios.forEach(r => r.checked = false);
                
                radios.forEach(r => r.disabled = false);
                updatePackageSummary();
            }
        });
    }

    return builder;
}


function handleServiceSelection(event) {
    try {
        const radio = event.target;
        console.log('Service selected:', radio.dataset);

        const serviceCode = radio.dataset.service;
        const serviceType = radio.dataset.serviceType;
        const variantKey = radio.value;
        const price = parseFloat(radio.dataset.price);
        const name = radio.dataset.name;
        const isRecurring = radio.dataset.recurring === 'true';

        if (radio.checked) {
            console.log('Adding service to selection:', {
                serviceCode,
                serviceType,
                variantKey,
                price,
                name,
                isRecurring
            });

            selectedServices.set(serviceCode, {
                serviceType,
                variantKey,
                price,
                name,
                isRecurring
            });
            
            const hasCore = Array.from(selectedServices.values())
                .some(service => service.serviceType === 'Core');

            const optionalRadios = document.querySelectorAll('input[type="radio"][data-service-type="Optional"]');
            optionalRadios.forEach(radio => {
                radio.disabled = !hasCore;
            });

            const coreRadios = document.querySelectorAll('input[type="radio"][data-service-type="Core"]');
            if (hasCore) {
                const selectedCoreCode = Array.from(selectedServices.entries()).find(([c, s]) => s.serviceType === 'Core')[0];
                coreRadios.forEach(r => {
                    r.disabled = (r.dataset.service !== selectedCoreCode);
                });
            } else {
                coreRadios.forEach(r => r.disabled = false);
            }

            if (serviceType === 'Optional' && !hasCore) {
                alert('Please select at least one Core service before adding Optional services.');
                radio.checked = false;
                selectedServices.delete(serviceCode);
                return;
            }
        }

        console.log('Current selected services:', selectedServices);
        updatePackageSummary();
    } catch (error) {
        console.error('Error in handleServiceSelection:', error);
    }
}


function removeService(serviceCode) {
    const service = selectedServices.get(serviceCode);
    if (service) {
        const radio = document.querySelector(`input[type="radio"][data-service="${serviceCode}"]:checked`);
        if (radio) {
            radio.checked = false;
        }

        selectedServices.delete(serviceCode);

        if (service.serviceType === 'Core') {
            const hasCore = Array.from(selectedServices.values())
                .some(s => s.serviceType === 'Core');

            const optionalRadios = document.querySelectorAll('input[type="radio"][data-service-type="Optional"]');
            optionalRadios.forEach(radio => {
                radio.disabled = !hasCore;
            });

            const coreRadios = document.querySelectorAll('input[type="radio"][data-service-type="Core"]');
            if (hasCore) {
                const remainingCore = Array.from(selectedServices.entries()).find(([c, s]) => s.serviceType === 'Core');
                const remainingCode = remainingCore ? remainingCore[0] : null;
                coreRadios.forEach(r => {
                    r.disabled = remainingCode ? (r.dataset.service !== remainingCode) : false;
                });
            } else {
                coreRadios.forEach(r => r.disabled = false);
            }

            if (!hasCore) {
                selectedServices.forEach((s, code) => {
                    if (s.serviceType === 'Optional') {
                        removeService(code);
                    }
                });
            }
        }

        updatePackageSummary();
    }
}


async function generatePackagePDF() {
    const pdfContent = document.createElement('div');
    pdfContent.innerHTML = `
                    <div style="padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <img src="https://oakshiftsoftware.github.io/source/images/logos/logo-b.png" style="height: 100px;">
                            <h1>Provisional Package Quote</h1>
                            <p>Generated on ${new Date().toLocaleDateString()}</p>
                        </div>
                        <div style="margin-bottom: 30px;">
                            <h2>Selected Services</h2>
                            ${Array.from(selectedServices.entries()).map(([code, service]) => `
                                <div style="margin-bottom: 15px;">
                                    <h3>${service.name}</h3>
                                    <p>Price: ${formatPrice(service.price)}${service.isRecurring ? '/mo' : ''}</p>
                                </div>
                            `).join('')}
                        </div>
                        <div style="margin-bottom: 30px;">
                            <h2>Total Cost</h2>
                            <p>One-time Cost: ${document.getElementById('package-total-amount').textContent}</p>
                            <p>Recurring Cost: ${document.getElementById('package-recurring-amount').textContent || '£0.00'}</p>
                        </div>
                        <div>
                            <p>This is a provisional quote and is valid for 30 days. To proceed with this package, please contact us:</p>
                            <p>Email: oakshiftsoftware@gmail.com</p>
                            <p>Reference: PKG-${Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                        </div>
                    </div>
                `;

    try {
        const printWindow = window.open('', 'PRINT', 'height=800,width=1200');
        printWindow.document.write(`
                        <html>
                        <head>
                            <title>Package Quote</title>
                            <style>
                                body {
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
                                    line-height: 1.5;
                                    color: #363636;
                                }
                                h1, h2, h3 {
                                    font-family: inherit;
                                    margin-bottom: 1rem;
                                }
                                .quote-header {
                                    text-align: center;
                                    margin-bottom: 2rem;
                                    padding-bottom: 2rem;
                                    border-bottom: 2px solid #18bc9c;
                                }
                                .quote-section {
                                    margin-bottom: 2rem;
                                    padding: 1rem;
                                    background-color: #f8f9fa;
                                    border-radius: 5px;
                                }
                                .service-item {
                                    display: flex;
                                    justify-content: space-between;
                                    padding: 0.5rem 0;
                                    border-bottom: 1px solid #dee2e6;
                                }
                                .quote-footer {
                                    margin-top: 2rem;
                                    padding-top: 2rem;
                                    border-top: 2px solid #18bc9c;
                                    font-size: 0.9rem;
                                }
                            </style>
                        </head>
                        <body>
                    `);
        printWindow.document.write(pdfContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Error generating PDF. Please try again.');
    }
}


function updatePackageSummary() {
    const selectedServicesDiv = document.getElementById('selected-services');
    const totalAmount = document.getElementById('package-total-amount');
    const recurringAmount = document.getElementById('package-recurring-amount');
    const initialTotal = document.getElementById('package-initial-total');
    const exportButton = document.getElementById('export-package');
    const previewButton = document.getElementById('preview-package');

    let oneTimeTotal = 0;
    let recurringTotal = 0;
    let summaryHTML = '';

    selectedServices.forEach((selection, serviceCode) => {
        if (selection.isRecurring) {
            recurringTotal += selection.price;
        } else {
            oneTimeTotal += selection.price;
        }

        summaryHTML += `
                        <div class="service-item">
                            <div class="service-item-details">
                                <div>${selection.name}</div>
                                <div>${formatPrice(selection.price)}${selection.isRecurring ? '/mo' : ''}</div>
                            </div>
                            <button class="remove-service" onclick="removeService('${serviceCode}')">
                                ✕
                            </button>
                        </div>
                    `;
    });

    const selectedVariantCodes = Array.from(selectedServices.entries()).map(([code, sel]) => `${code}-${sel.variantKey}`); 
    const applicableDiscounts = findApplicableDiscounts(selectedVariantCodes);
    if (applicableDiscounts.length > 0) {
        applicableDiscounts.forEach(discount => {
            if (discount.discountedService && selectedVariantCodes.includes(discount.discountedService)) {
                const [serviceCode, variantKey] = discount.discountedService.split('-');
                const service = selectedServices.get(serviceCode);
                if (service && service.variantKey === variantKey) {
                    if (service.isRecurring) {
                        recurringTotal -= service.price;
                    } else {
                        oneTimeTotal -= service.price;
                    }
                    summaryHTML += `
                                    <div class="service-item">
                                        <div class="service-item-details">
                                            <div>${discount.name}</div>
                                            <div class="discount-badge">-${formatPrice(service.price)}${service.isRecurring ? '/mo' : ''}</div>
                                        </div>
                                    </div>
                                `;
                }
            } else {
                if (discount.type === 'percentage') {
                    if (discount.target === 'total') {
                        const discountAmount = oneTimeTotal * (discount.value / 100);
                        oneTimeTotal -= discountAmount;
                        summaryHTML += `
                                        <div class="service-item">
                                            <div class="service-item-details">
                                                <div>${discount.name}</div>
                                                <div class="discount-badge">-${discount.value}%</div>
                                            </div>
                                        </div>
                                    `;
                    }
                } else if (discount.type === 'fixed') {
                    oneTimeTotal -= discount.value;
                    summaryHTML += `
                                    <div class="service-item">
                                        <div class="service-item-details">
                                            <div>${discount.name}</div>
                                            <div class="discount-badge">-${formatPrice(discount.value)}</div>
                                        </div>
                                    </div>
                                `;
                }
            }
        });
    }

    selectedServicesDiv.innerHTML = summaryHTML;
    totalAmount.textContent = formatPrice(oneTimeTotal);
    recurringAmount.textContent = recurringTotal > 0 ? formatPrice(recurringTotal) + '/mo' : formatPrice(0) + '/mo';

    const hasServices = selectedServices.size > 0;
    exportButton.disabled = !hasServices;
    previewButton.disabled = !hasServices;

    const initialPayment = oneTimeTotal + recurringTotal;
    initialTotal.textContent = formatPrice(initialPayment);
    try { savePackageCache(); } catch (e) { console.error('Error auto-saving package', e); }
}


function generatePDFContent() {
    if (!currentReferenceCode) {
        currentReferenceCode = 'PKG-' + randomToken(8);
        lastSavedContentKey = getPackageContentKey();
    }
    const oneTimeCost = document.getElementById('package-total-amount').textContent;
    const recurringCost = document.getElementById('package-recurring-amount').textContent;
    const initialTotal = document.getElementById('package-initial-total').textContent;

    const coreServices = Array.from(selectedServices.entries())
        .filter(([, s]) => s.serviceType === 'Core');
    const optionalServices = Array.from(selectedServices.entries())
        .filter(([, s]) => s.serviceType === 'Optional');

    const servicesContent = `
                    <div style="margin-bottom: 30px;">
                        <h3 style="color: #363636; margin-bottom: 15px;">Core Services</h3>
                        ${coreServices.map(([code, service]) => `
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                                <div>${service.name}</div>
                                <div style="font-weight: 500;">${formatPrice(service.price)}${service.isRecurring ? '/mo' : ''}</div>
                            </div>
                        `).join('')}
                        ${optionalServices.length > 0 ? `
                            <h3 style="color: #363636; margin: 20px 0 15px;">Additional Services</h3>
                            ${optionalServices.map(([code, service]) => `
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                                    <div>${service.name}</div>
                                    <div style="font-weight: 500;">${formatPrice(service.price)}${service.isRecurring ? '/mo' : ''}</div>
                                </div>
                            `).join('')}
                        ` : ''}
                    </div>
                `;

    const selectedVariantCodes = Array.from(selectedServices.entries())
        .map(([code, sel]) => `${code}-${sel.variantKey}`);
    const applicableDiscounts = findApplicableDiscounts(selectedVariantCodes);
    const discountsContent = applicableDiscounts.length > 0 ? `
                    <div style="margin-bottom: 30px;">
                        <h3 style="color: #363636; margin-bottom: 15px;">Applied Deals</h3>
                        ${applicableDiscounts.map(d => `
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                                <div>${d.name}</div>
                                <div style="font-weight: 500; color: #dc3545;">
                                    ${d.type === 'percentage' ? `-${d.value}%` :
            d.discountedService ? (() => {
                const [serviceCode, variantKey] = d.discountedService.split('-');
                const service = selectedServices.get(serviceCode);
                return service && service.variantKey === variantKey ?
                    `-${formatPrice(service.price)}${service.isRecurring ? '/mo' : ''}` :
                    '-Amount varies';
            })() :
                `-${formatPrice(d.value)}`}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '';

    return `
                    <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <img src="https://oakshiftsoftware.github.io/source/images/logos/logo-b.png" style="height: 100px;">
                            <h1 style="margin: 20px 0 10px;">Package Quote</h1>
                            <div style="color: #666;">Generated on ${new Date().toLocaleDateString()}</div>
                            <div style="color: #363636; font-weight: bold; margin-top: 5px;">Reference: ${currentReferenceCode}</div>
                        </div>

                        ${servicesContent}
                        ${discountsContent}

                        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #eee;">
                            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                <div>One-time Setup Cost</div>
                                <div style="font-weight: 500;">${oneTimeCost}</div>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                <div>Monthly Cost</div>
                                <div style="font-weight: 500;">${recurringCost}</div>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 15px 0; margin-top: 10px; border-top: 1px solid #eee; font-weight: bold;">
                                <div>Initial Payment Required</div>
                                <div>${initialTotal}</div>
                            </div>
                            <div style="font-size: 0.9em; color: #666; text-align: right;">
                                (Setup Cost + First Month)
                            </div>
                        </div>

                        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; color: #666;">
                            <p>This is a provisional quote and is valid for 30 days. To proceed with this package or discuss customizations, please save this quote as a PDF (you may be asked to provide this) and contact us using the details below:</p>
                            <p style="margin-top: 0px;">
                                <strong>Email:</strong> oakshiftsoftware@gmail.com<br>
                                <strong>Phone:</strong> +44(0) 7423 230 653
                            </p>
                            <p style="margin-top: 15px;">
                                <strong>Please reference:</strong> ${currentReferenceCode}
                            </p>
                        </div>
                    </div>
                `;
}


function previewPackageQuote() {
    if (!currentReferenceCode) {
        currentReferenceCode = 'PKG-' + randomToken(8);
        lastSavedContentKey = getPackageContentKey();
    }
    const modal = document.createElement('div');
    modal.className = 'modal';

    const coreServices = Array.from(selectedServices.entries())
        .filter(([, s]) => s.serviceType === 'Core');
    const optionalServices = Array.from(selectedServices.entries())
        .filter(([, s]) => s.serviceType === 'Optional');

    const oneTimeCost = document.getElementById('package-total-amount').textContent;
    const recurringCost = document.getElementById('package-recurring-amount').textContent;
    const initialTotal = document.getElementById('package-initial-total').textContent;

    const servicesSummary = `
                    <div class="services-summary">
                        <div class="service-group">
                            <h4>Core Services</h4>
                            ${coreServices.map(([code, service]) => `
                                <div class="service-row">
                                    <div class="service-name">${service.name}</div>
                                    <div class="service-price">${formatPrice(service.price)}${service.isRecurring ? '/mo' : ''}</div>
                                </div>
                            `).join('')}
                        </div>
                        ${optionalServices.length > 0 ? `
                            <div class="service-group">
                                <h4>Additional Services</h4>
                                ${optionalServices.map(([code, service]) => `
                                    <div class="service-row">
                                        <div class="service-name">${service.name}</div>
                                        <div class="service-price">${formatPrice(service.price)}${service.isRecurring ? '/mo' : ''}</div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;

    const selectedVariantCodes = Array.from(selectedServices.entries())
        .map(([code, sel]) => `${code}-${sel.variantKey}`);
    const applicableDiscounts = findApplicableDiscounts(selectedVariantCodes);
    const discountsSummary = applicableDiscounts.length > 0 ? `
                    <div class="discounts-summary">
                        <h4>Applied Discounts</h4>
                        ${applicableDiscounts.map(d => `
                            <div class="discount-row">
                                <div class="discount-name">${d.name}</div>
                                <div class="discount-value">
                                    ${d.type === 'percentage' ? `${d.value}%` :
            d.discountedService ? (() => {
                const [serviceCode, variantKey] = d.discountedService.split('-');
                const service = selectedServices.get(serviceCode);
                return service && service.variantKey === variantKey ?
                    `-${formatPrice(service.price)}${service.isRecurring ? '/mo' : ''}` :
                    '-Amount varies';
            })() :
                formatPrice(d.value)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '';

    modal.innerHTML = `
                    <div class="modal-content" style="padding: 0px;">
                        <div class="modal-header">
                            <h3>Package Quote Preview</h3>
                            <button class="modal-close">&times;</button>
                        </div>
                        <div id="preview-content" class="quote-preview">
                            <div class="quote-header">
                                <div class="quote-reference">Reference: ${currentReferenceCode}</div>
                                <div class="quote-date">Generated: ${new Date().toLocaleDateString()}</div>
                            </div>
                            
                            ${servicesSummary}
                            ${discountsSummary}
                            
                            <div class="quote-totals">
                                <div class="total-row">
                                    <div>One-time Setup</div>
                                    <div>${oneTimeCost}</div>
                                </div>
                                <div class="total-row">
                                    <div>Monthly Cost</div>
                                    <div>${recurringCost}</div>
                                </div>
                                <div class="total-row total-highlight">
                                    <div>Initial Payment</div>
                                    <div>${initialTotal}</div>
                                    <div class="total-note">(Setup + First Month)</div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-actions" style=" margin-top: 0px; padding: 0 1.5rem 1.5rem 1.5rem;">
                            <button class="package-action-button secondary" onclick="copyToClipboard()">
                                Copy to Clipboard
                            </button>
                            <button class="package-action-button primary" onclick="exportAsPDF()">
                                Export as PDF
                            </button>
                        </div>
                    </div>
                `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
                    .quote-preview {
                        padding: 1.5rem;
                    }
                    .quote-header {
                        margin-bottom: 1.5rem;
                        padding-bottom: 1rem;
                        border-bottom: 1px solid #eee;
                    }
                    .quote-reference {
                        font-size: 1.1rem;
                        font-weight: bold;
                        color: var(--primary-color);
                    }
                    .quote-date {
                        font-size: 0.9rem;
                        color: #666;
                    }
                    .services-summary {
                        margin-bottom: 1.5rem;
                    }
                    .service-group {
                        margin-bottom: 1rem;
                    }
                    .service-group h4 {
                        margin-bottom: 0.5rem;
                        color: var(--primary-color);
                    }
                    .service-row, .discount-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 0.5rem;
                        border-bottom: 1px solid #f5f5f5;
                    }
                    .service-row:last-child {
                        border-bottom: none;
                    }
                    .service-name, .discount-name {
                        flex: 1;
                    }
                    .service-price, .discount-value {
                        font-weight: 500;
                        margin-left: 1rem;
                    }
                    .discounts-summary {
                        margin: 1.5rem 0;
                        padding-top: 1rem;
                        border-top: 1px solid #eee;
                    }
                    .quote-totals {
                        margin-top: 1.5rem;
                        padding-top: 1rem;
                        border-top: 1px solid #eee;
                    }
                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 0.5rem;
                        font-weight: 500;
                    }
                    .total-highlight {
                        margin-top: 0.5rem;
                        padding-top: 1rem;
                        border-top: 1px solid #eee;
                        font-size: 1.1rem;
                        font-weight: bold;
                        color: var(--primary-color);
                    }
                    .total-note {
                        display: block;
                        font-size: 0.8rem;
                        color: #666;
                        font-weight: normal;
                        margin-top: 0.25rem;
                    }
                `;
    document.head.appendChild(styleSheet);
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);

    modal.querySelector('.modal-close').onclick = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    };

    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    };
}


async function copyToClipboard() {
    const content = document.getElementById('preview-content').innerText;
    try {
        await navigator.clipboard.writeText(content);
        alert('Quote content copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy content. Please try again.');
    }
}


function exportAsPDF() {
    try {
        const printWindow = window.open('', 'PRINT', 'height=800,width=1200');
        printWindow.document.write(`
                        <html>
                        <head>
                            <title>Package Quote</title>
                            <style>
                                body {
                                    font-family: Arial, sans-serif;
                                    line-height: 1.6;
                                    color: #333;
                                    padding: 20px;
                                }
                                h1, h2, h3 {
                                    color: #363636;
                                }
                                @media print {
                                    body {
                                        padding: 0;
                                    }
                                }
                            </style>
                        </head>
                        <body>
                            ${generatePDFContent()}
                        </body>
                    </html>
                    `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Error generating PDF. Please try again.');
    }
}


function findApplicableDiscounts(selectedVariantCodes) {
    return availableDiscounts.filter(discount => {
        if (Array.isArray(discount.requiredServices) && discount.requiredServices.length > 0) {
            const requiredMet = discount.requiredServices.every(req => selectedVariantCodes.includes(req));
            
            if (requiredMet && discount.discountedService) {
                return selectedVariantCodes.includes(discount.discountedService);
            }
            return requiredMet;
        }
        return false;
    });
}


async function loadServices() {
    try {
        const response = await fetch(services_list_url);
        const services = await response.json();
        const servicesContent = document.getElementById('services-content');
        servicesContent.innerHTML = ''; // Clear loading message

        const serviceGrid = document.createElement('div');
        serviceGrid.className = 'service-grid';

        services.forEach(service => {
            serviceGrid.appendChild(createServiceCard(service));
        });

        servicesContent.appendChild(serviceGrid);
    } catch (error) {
        console.error('Error loading services:', error);
        const servicesContent = document.getElementById('services-content');
        servicesContent.innerHTML = '<div class="card"><h2>Error</h2><p>Unable to load services. Please try again later.</p></div>';
    }
}


async function loadPackages() {
    try {
        const [servicesResponse, discountsResponse] = await Promise.all([
            fetch(services_list_url),
            fetch(discounts_url).catch(() => ({ json: () => [] }))
        ]);

        const services = await servicesResponse.json();
        availableDiscounts = await discountsResponse.json();

        const packagesContent = document.getElementById('packages-content');
        packagesContent.innerHTML = `
                        <h2>Build Your Package</h2>
                        <p>Select the services you'd like to include in your package. Mix and match to create your perfect solution.</p>
                    `;

        const builderElem = createPackageBuilder(services);
        packagesContent.appendChild(builderElem);

        const restored = loadPackageCache();
        if (restored) {
            try {
                selectedServices.forEach((sel, code) => {
                    const radio = packagesContent.querySelector(`input[type="radio"][data-service="${code}"][value="${sel.variantKey}"]`);
                    if (radio) radio.checked = true;
                });

                const hasCore = Array.from(selectedServices.values()).some(s => s.serviceType === 'Core');
                const optionalRadios = packagesContent.querySelectorAll('input[type="radio"][data-service-type="Optional"]');
                optionalRadios.forEach(r => r.disabled = !hasCore);

                const coreRadios = packagesContent.querySelectorAll('input[type="radio"][data-service-type="Core"]');
                if (hasCore) {
                    const selectedCoreCode = Array.from(selectedServices.entries()).find(([c, s]) => s.serviceType === 'Core')[0];
                    coreRadios.forEach(r => r.disabled = (r.dataset.service !== selectedCoreCode));
                } else {
                    coreRadios.forEach(r => r.disabled = false);
                }

                const allRadioButtons = packagesContent.querySelectorAll('input[type="radio"]');
                allRadioButtons.forEach(radio => {
                    radio.removeEventListener('change', handleServiceSelection);
                    radio.addEventListener('change', handleServiceSelection);
                });

                updatePackageSummary();
            } catch (e) {
                console.error('Error restoring package state:', e);
            }
        }
    } catch (error) {
        console.error('Error loading package builder:', error);
        const packagesContent = document.getElementById('packages-content');
        packagesContent.innerHTML = '<div class="card"><h2>Error</h2><p>Unable to load package builder. Please try again later.</p></div>';
    }
}


window.copyToClipboard = copyToClipboard;
window.exportAsPDF = exportAsPDF;


function openMobileNav() {
    const modal = document.createElement('div');
    modal.className = 'modal mobile-nav-modal';
    const navHtml = document.querySelector('nav').innerHTML;
    modal.innerHTML = `
                    <div class="modal-content">
                        <div class="mobile-nav-panel">
                            <div class="mobile-nav-header">
                                <span class="mobile-nav-title">Menu</span>
                                <button class="modal-close" aria-label="Close menu">&times;</button>
                            </div>
                            <nav class="mobile-nav-list">${navHtml}</nav>
                        </div>
                    </div>
                `;
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
    setTimeout(() => modal.classList.add('active'), 10);

    const closeMenu = () => {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        setTimeout(() => modal.remove(), 320);
    };

    modal.querySelector('.modal-close').onclick = closeMenu;
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeMenu();
        }
    };

    modal.querySelectorAll('.mobile-nav-list a').forEach(a => {
        a.addEventListener('click', (ev) => {
            ev.preventDefault();
            const target = a.getAttribute('href').substring(1);
            navigateToPage(target);
            closeMenu();
        });
    });
}


function openPackageFabModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    const selectedHTML = document.getElementById('selected-services')?.innerHTML || '<div class="card"><p>No services selected yet.</p></div>';
    modal.innerHTML = `
                    <div class="modal-content">
                        <span class="modal-close">&times;</span>
                        <h3>Your Package (Preview)</h3><br /><br />
                        <div id="fab-package-summary">${selectedHTML}</div>
                        <div style="margin-top:12px; color:#666; font-size:0.9rem;">Initial Payment: <strong id="fab-initial">${document.getElementById('package-initial-total')?.textContent || '£0.00'}</strong></div>
                        <div class="modal-actions">
                            <button class="package-action-button secondary" id="fab-show-options">Show Options</button>
                            <button class="package-action-button secondary" id="fab-preview">Preview</button>
                            <button class="package-action-button primary" id="fab-export">Export</button>
                        </div>
                    </div>
                `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);

    modal.querySelector('.modal-close').onclick = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    };
    modal.onclick = (e) => { if (e.target === modal) { modal.querySelector('.modal-close').click(); } };

    modal.querySelector('#fab-preview').addEventListener('click', () => {
        modal.querySelector('.modal-close').click();
        previewPackageQuote();
    });
    modal.querySelector('#fab-export').addEventListener('click', () => {
        modal.querySelector('.modal-close').click();
        exportAsPDF();
    });
    modal.querySelector('#fab-show-options').addEventListener('click', () => {
        modal.querySelector('.modal-close').click();
        navigateToPage('packages');
        
        setTimeout(() => {
            const servicesSection = document.querySelector('#packages-content .services-section');
            if (servicesSection) servicesSection.scrollIntoView({ behavior: 'smooth' });
        }, 200);
    });
}


document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'preview-package') {
        previewPackageQuote();
    } else if (e.target && e.target.id === 'export-package') {
        exportAsPDF();
    }
});


function navigateToPage(pageId, pushState = true) {
    sections.forEach(section => {
        if (section.id === pageId) {
            section.classList.remove('hidden');
            section.classList.add('active');
            if (pageId === 'services') loadServices();
            if (pageId === 'packages') loadPackages();
        } else {
            section.classList.remove('active');
            section.classList.add('hidden');
        }
    });
    
    if (pushState) {
        history.pushState({ page: pageId }, '', `#${pageId}`);
    }

    window.scrollTo(0, 0);
}


window.addEventListener('popstate', (event) => {
    const pageId = event.state?.page || window.location.hash.substring(1) || 'home';
    navigateToPage(pageId, false);
});

window.addEventListener('hashchange', () => {
    const pageId = window.location.hash.substring(1) || 'home';
    navigateToPage(pageId, false);
});


document.addEventListener('DOMContentLoaded', () => {
    const internalHashLinks = document.querySelectorAll('a[href^="#"]');
    internalHashLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (!href || !href.startsWith('#')) return;
            const targetId = href.substring(1);
            const targetSection = document.getElementById(targetId);
            if (!targetSection) return;
            e.preventDefault();
            navigateToPage(targetId);
        });
    });

    const initialPage = window.location.hash.substring(1) || 'home';
    navigateToPage(initialPage);

    window.addEventListener('load', () => {
        window.scrollTo(0, 0);
    });

    const navToggle = document.getElementById('nav-toggle');
    if (navToggle) navToggle.addEventListener('click', openMobileNav);

    const packageFab = document.getElementById('package-fab');
    if (packageFab) packageFab.addEventListener('click', (e) => {
        const current = document.querySelector('main section.active')?.id;
        if (current !== 'packages') {
            navigateToPage('packages');
            setTimeout(() => openPackageFabModal(), 300);
        } else {
            openPackageFabModal();
        }
    });
});


const sections = document.querySelectorAll('main section');
const navLinks = document.querySelectorAll('nav ul li a');
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        navigateToPage(targetId);
    });
});
