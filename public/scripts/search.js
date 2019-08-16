/*global window document*/
/* eslint-disable no-plusplus */

window.onload = getPublications();
window.onload = activateNotificationSucessModal();
window.onload = getBookmarks();

/*************************************/
/* General Functions */
function changeCaption(type) {
    let caption = document.querySelector("#" + type + " .search-caption");
    caption.textContent = "Chosen " + type;
}

function makeInactive(type) {
    let prev = document.querySelector("#" + type);
    prev.className = type + "-inactive";
    console.log("making inactive: " + type);
}

function enable(type, chosenPub, fullURL) {
    let current = document.querySelector("#" + type);
    current.className = type + "-active";
    
    switch (type) {
        case 'channel':
            //enabled the channel column, adds a return to step 1 button and makes the publication column inactive.
            makeInactive("publication");
            getChannels(chosenPub);
            createBackToStepOneBtn();
            break;
        case 'publication':
            //enables the publication column
            let caption = current.querySelector(".search-caption");
            caption.innerText = "Search " + type + "s";
            break;
        case 'notification':
            //enables the notification column and makes the channel column inactive.
            createBackToStepTwoBtn();
            makeInactive("channel");
            let isBlocked = checkIfBlockedChannel();
            if (!isBlocked) {
                const msgBody = document.querySelector("#message");
                msgBody.disabled = false;
                msgBody.addEventListener("keyup", messageLimit);
                msgBody.addEventListener("keydown", enableSendBtn);
                const url = document.querySelector("#url");
                url.disabled = false;
                url.addEventListener("keydown", enableSendBtn);
            }
            break;
        case 'history':
            //enables the history table and view sent notifications button
            const tableHeading = document.querySelector(".table-heading-inactive");
            if (tableHeading) {
                tableHeading.className = "table-heading-active";
            }
            const viewAllBtn = document.querySelector(".view-btn");
            viewAllBtn.disabled = false;
            viewAllBtn.addEventListener("click", function () {
                viewAllNotifications();
            });
            fillRecentHistoryTable(fullURL);
            break;
    }
}

function storeFullURL(url) {
    let store = document.querySelector("#notification h2");
    store.id = url;
}
/* General Functions */
/*************************************/



/*************************************/
/* Functions relating to the publication column */
function getPublications() {
    fetch(`/allPublications`)
        .then(res => {
            return res.json();
        })
        .then(json => {
            let publicationNames = Object.keys(json);
            search(document.querySelector('.my-publication'), publicationNames);
        })
        .catch(function (err) {
            console.log('Fetch Publication Error :', err);
            // alert("An error occurred. Please reload the page and try again");
        });
}

function removeSearchBar() {
    let searchSection = document.getElementById("search-publication");
    let searchBar = searchSection.querySelector(".my-publication");
    searchSection.removeChild(searchBar);
}

function makeChosenOptionHome() {
    let searchSection = document.getElementById("search-publication");
    let chosen = searchSection.querySelector("#chosen-pub");

    let input = document.createElement("input");
    input.setAttribute("class", "my-publication");
    input.setAttribute("type", "text");
    input.setAttribute("placeholder", "Type publication's name");

    chosen.addEventListener("click", function () {
        console.log("Clicked on a publication to go back to step 1");
        makeInactive("channel");
        makeInactive("notification");
        makeInactive("history");
        resetPublication();
        resetNotification();
        resetChannel();
        resetHistory();
        hideMobile("channel");
        hideMobile("notif");
        hideMobile("history");
        const sendBtn = document.querySelector("#notification .send-btn");
        sendBtn.disabled = true;
    });
}

function resetPublication() {
    let searchSection = document.getElementById("search-publication");
    let chosen = searchSection.querySelector("#chosen-pub");
    let input = document.createElement("input");
    input.setAttribute("class", "my-publication");
    input.setAttribute("type", "text");
    input.setAttribute("placeholder", "Type publication's name");
    searchSection.appendChild(input);
    if (chosen) {
        searchSection.removeChild(chosen);
    }
    getPublications();
    enable("publication");
    if (isMobile()) {
        const pubHeader = document.querySelector(".publication-heading");
        pubHeader.setAttribute("style", "display: flex");
        const pubContainer = document.querySelector("#publication");
        pubContainer.setAttribute("style", "min-height: 250px;");
    }
}

function search(searchBar, pubList) {
    searchBar.addEventListener("input", function () {
        let all, i, val = this.value;

        closeAllLists();
        if (!val) { return false;}

        all = document.createElement("div");
        all.setAttribute("class", "search-items");

        this.parentNode.appendChild(all);
 
        for (i = 0; i < pubList.length; i++) {

            if (pubList[i].substr(0, val.length).toUpperCase() === val.toUpperCase()) {
                let matches = document.createElement("div");
                matches.setAttribute("class", "items");
                const logo = "<div data-site=" + pubList[i] + " class='pub-logo'></div>";
                const title = "<div class='option'>" + pubList[i] + "</div>";

                matches.innerHTML = logo;
                matches.innerHTML += title;
                matches.innerHTML += "<input type='hidden' value='" + pubList[i] + "'>";
                matches.addEventListener("click", function () {
                    const chosenPublication = this.getElementsByTagName("input")[0].value;
                    searchBar.value = chosenPublication;

                    let option = document.createElement("div");
                    option.setAttribute("class", "items");
                    option.setAttribute("id", "chosen-pub");
                    option.innerHTML = logo;
                    option.innerHTML += title;
                    searchBar.insertAdjacentElement("beforebegin", option);

                    console.log("Clicked on publication to advance to step 2");
                    makeChosenOptionHome();
                    removeSearchBar();
                    changeCaption("publication");
                    closeAllLists();
                    enable("channel", chosenPublication, "");
                    
                    if (isMobile()) {
                        const pubHeader = document.querySelector(".publication-heading");
                        pubHeader.setAttribute("style", "display: none");
                        const pubContainer = document.querySelector("#publication");
                        pubContainer.setAttribute("style", "min-height: 110px;");
                    }
                });
                all.appendChild(matches);
            }
        }
    });

    searchBar.addEventListener("keydown", function (e) {
        let dropdown = document.querySelector(".search-items");
        if (dropdown) {
            dropdown = dropdown.getElementsByTagName("div");
        }
        if (e.keyCode === 13) {
            /*If the ENTER key is pressed, prevent the form from being submitted. */
            e.preventDefault();
        }
    });

    function closeAllLists(elmnt) {
        let l = document.getElementsByClassName("search-items");
        for (let i = 0; i < l.length; i++) {
            if (elmnt !== l[i] && elmnt !== searchBar) {
                l[i].parentNode.removeChild(l[i]);
            }
        }
    }

    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
}
/* Functions relating to the publication column */
/*************************************/




/*************************************/
/* Functions relating to the channel column */
function getChannels(chosenPub) {
    fetch(`/channelDetails?publication=${chosenPub}`)
        .then(res => res.json())
        .then(json => {
            json.sort((a, b) => {
                return (a.name < b.name) ? -1 : (a.name > b.name) ? 1 : 0;
            });
            const { names, homepages, subs, writeAccess, fullURL } = split(json);
            dropDown(names, homepages, subs, writeAccess, fullURL);
        })
        .catch(function (err) {
            console.log('Fetch Channel Error :', err);
        });

    function split(channels) {
        let i = 0;
        const homepages = [], names = [], subs = [], writeAccess = [], fullURL = [];
        channels.forEach(c => {
            fullURL[i] = c.homepage;
            homepages[i] = c.homepage.replace(/^[^\.]+\./, '');
            names[i] = c.name;
            subs[i] = c.sub;
            writeAccess[i] = c.writeAccess;
            i++;
        });
        return { names, homepages, subs, writeAccess, fullURL };
    }
}

function dropDown(n, h, s, w, u) {

    let scrollableDiv = document.getElementById("channel-list");
    let select = document.querySelector(".my-channel");
    if (select) {
        select.parentNode.removeChild(select);
    }

    let i, j = 0;
    for (i = 0; i < n.length; i++) {
        scrollableDiv.innerHTML += "<div id='channel-items' class='items'></div>";
    }

    let channelItems = scrollableDiv.querySelectorAll(".items");
    Array.from(channelItems).forEach(c => {
        c.innerHTML = `<div class='logoAndText'>
            <div id='channel-logo' class='pub-logo' data-publication="${h[j]}"></div>
            <div id='channel-options' class='option'>${n[j]}</div>
        </div>`;
        if (w[j]) {
            //if write access is true
            if (isBookmarked(c)) {
                c.innerHTML += "<div><img class='bookmarkIcon' id='bookmarked' src='/images/bookmark-chosen.png'></div>";
            } else {
                c.innerHTML += "<div><img class='bookmarkIcon' id='not-bookmarked' src='/images/bookmark.png'></div>";
            }
        } else {
            c.innerHTML += "<div><img id='blocked' src='/images/lock.png'></div>";
        }

        let count = s[j];
        let fullURL = u[j];

        c.firstChild.addEventListener("click", function functionsToRemove() {
            console.log(c, count, fullURL);
            console.log("Clicked on a channel to advance to step 3");
            changeCaption("channel");
            removeBackToStepOneBtn();
            addExtraChannelInfo(count, c);
            deleteOtherChannelOptions(c);
            enable("notification");
            enable("history", c, fullURL);
            storeFullURL(fullURL);
            c.removeEventListener("click", functionsToRemove);
            if (isMobile()) {
                const channelHeader = document.querySelector(".channel-heading");
                channelHeader.setAttribute("style", "display: none");
                const channelCaption = channelHeader.nextSibling;
                channelCaption.setAttribute("style", "display: unset");
                document.querySelector(".notif-history").classList.remove("mobile");
            }
        });
        j++;
    });

    addEventListenerToBookmarkIcon();
}

function deleteOtherChannelOptions(chosenPub) {
    let channelList = document.querySelector("#channel-list");
    channelList.insertAdjacentElement("beforebegin", chosenPub);
    let channelChildren = channelList.querySelectorAll(".items");
    let search = channelList.querySelector(".my-channel");
    console.log(channelChildren);
    if (channelChildren.length > 0) {
        Array.from(channelChildren).forEach(c => {
            channelList.removeChild(c);
        });
    } else {
        channelList.removeChild(search);
    }

}

function resetChannel() {
    console.log("removing results found for channels");
    let channelBlock = document.querySelector("#channel-list");
    let channelList = channelBlock.getElementsByClassName("items");
    if (channelList) {
        console.log("Found a list of channels to remove");
        Array.from(channelList).forEach(c => {
            channelBlock.removeChild(c);
        });
    }

    removeExtraInfoDiv();
    removeChosenChannel();
    removeBackToStepOneBtn();
    
    let input = document.createElement("input");
    input.setAttribute("class", "my-channel");
    input.setAttribute("type", "text");
    input.setAttribute("disabled", true);
    channelBlock.appendChild(input);

    let caption = document.querySelector("#channel .search-caption");
    caption.textContent = "Channels";

    let channelHeading = document.querySelector("#channel .channel-heading");
    channelHeading.setAttribute("style", "display: flex");
}

function removeChosenChannel() {
    let chosenChannel = document.querySelector("#channel-items");
    if (chosenChannel) {
        console.log("removing chosen channel");
        chosenChannel.parentElement.removeChild(chosenChannel);
    }
}

function removeExtraInfoDiv() {
    let extraInfo = document.querySelector(".extra-info-div");
    if (extraInfo) {
        console.log("removing extra info for chosen channel");
        extraInfo.parentElement.removeChild(extraInfo);
    }
}

function createBackToStepOneBtn() {
    const returnToStepOne = document.createElement("div");
    returnToStepOne.setAttribute("class", "return");
    returnToStepOne.innerHTML = "<img class='return-arrow' src='/images/back-arrow.png'>";
    const returnText = document.createElement("h4");
    returnText.setAttribute("class", "return-text");
    returnText.textContent = "Back to Step 1";
    returnToStepOne.insertAdjacentElement("beforeend", returnText);

    returnToStepOne.addEventListener("click", function () {
        enable("publication");
        makeInactive("channel");
        resetPublication();
        resetChannel();
        const mobileChannel = document.querySelector("#channel");
        mobileChannel.classList.add("mobile");
    });

    if (isMobile()) {
        const channelCaption = document.querySelector("#channel .channel-heading").nextSibling;
        channelCaption.setAttribute("style", "display: none");
        returnText.setAttribute("style", "align-items: center;");
        moveStepOneBtn(returnToStepOne);
    } else {
        const caption = document.querySelector("#channel .search-caption");
        caption.insertAdjacentElement("afterend", returnToStepOne);
    }
}

function removeBackToStepOneBtn() {
    let backBtn = document.querySelector("#channel .return");
    if (backBtn) {
        backBtn.parentElement.removeChild(backBtn);
    }
}

function addEventListenerToBookmarkIcon() {
    const bookmarkIcons = document.querySelectorAll("#channel .bookmarkIcon");
    bookmarkIcons.forEach(b => {
        const divWithChannelDetails = b.parentElement.previousSibling;
        const url = divWithChannelDetails.querySelector("#channel-logo").getAttribute("data-publication");
        const name = divWithChannelDetails.querySelector("#channel-options").innerText;
        if (b.id === "bookmarked") {
            b.addEventListener("click", () => {
                deleteBookmark(url, name);
                b.setAttribute("src", "./images/bookmark.png");
                b.setAttribute("id", "not-bookmarked");
                getBookmarks();
                addEventListenerToBookmarkIcon();
            });
        } else if (b.id === "not-bookmarked") {
            b.addEventListener("click", () => {
                addNewBookmark(url, name);
                b.setAttribute("src", "./images/bookmark-chosen.png");
                b.setAttribute("id", "bookmarked");
                getBookmarks();
                addEventListenerToBookmarkIcon();
            });
        }
    });
}

function addExtraChannelInfo(subCount, chosenPub) {
    const url = chosenPub.querySelector("#channel-logo").getAttribute("data-publication");
    let selectedChannel = document.querySelector("#channel .items");
    console.log(selectedChannel);

    let extraInfoDiv = document.createElement("div");
    extraInfoDiv.setAttribute("class", "extra-info-div");
    let channelURL = document.createElement("h4");
    channelURL.innerText = "Channel URL: " + url;
    let subscriberCount = document.createElement("h4");
    subscriberCount.innerText = "Subscribers: " + subCount;

    extraInfoDiv.appendChild(subscriberCount);
    extraInfoDiv.appendChild(channelURL);
    selectedChannel.insertAdjacentElement("afterend", extraInfoDiv);
}
/* Functions relating to the channel column */
/*************************************/





/*************************************/
/* Functions relating to the notification sending column */
function checkIfBlockedChannel() {
    const isBlocked = document.querySelector("#channel-items #blocked");
    const remainingChars = document.querySelector("#remaining-characters");

    if (isBlocked) {
        console.log("You clicked on a blocked channel!");
        const msgBox = document.querySelector("#notification .msg");
        const errorMsg = document.createElement("div");
        errorMsg.setAttribute("class", "items");
        errorMsg.innerText = "Uh-oh... It looks like you don't have publishing permissions for this channel. Please contact the Service Desk on 2323 for help.";
        msgBox.insertAdjacentElement("beforebegin", errorMsg);
        msgBox.parentElement.removeChild(msgBox);
        remainingChars.setAttribute("style", "color: #415161");
    } else {
        remainingChars.setAttribute("style", "color: white");
    }
    return isBlocked;
}

function messageLimit() {
    const characterLimit = 40;
    let currentTextLength = document.querySelector("#message").value.length;
    let characterCountLabel = document.querySelector("#remaining-characters");
    let remainingChars = characterLimit - currentTextLength;
    if (remainingChars > 0) {
        characterCountLabel.innerText = remainingChars + " Characters remaining";
        characterCountLabel.setAttribute("style", "color: white;");
    } else {
        characterCountLabel.innerText = "0 Characters remaining";
        characterCountLabel.setAttribute("style", "color: #D20303;");
    }
}

function enableSendBtn() {
    const msgBody = document.querySelector("#message").value.length;
    const url = document.querySelector("#url").value.length;
    const sendBtn = document.querySelector("#notification .send-btn");
    if (msgBody > 0 && url > 0) {
        const pass = urlValidation();
        if (pass) {
            sendBtn.disabled = false;
        }
    } else {
        sendBtn.disabled = true;
    }
}

const sendNotification = () => {
    const body = document.querySelector("#message").value;
    const url = document.querySelector("#url").value;
    const silent = document.querySelector("#silent").checked;
    const publication = document.querySelector("#notification h2").id;
    fetch(`/send`, {
        method: 'POST',
        mode: 'cors',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            body,
            url,
            silent,
            publication
        })
    })
        .then((response) => {
            console.log(response.status);
            if (response.status === 200) {
                notificationSuccess();
            } else if (response.status === 400) {
                notificationFail();
            }
        });
};

function urlValidation() {
    const url = document.querySelector("#url");
    return url.value.includes("www.");
}

function notificationFail() {
    console.log("Notification failed to send");
    const failModal = document.querySelector(".error-modal");
    failModal.style.display = "block";
    const close = document.querySelector(".close");
    close.addEventListener("click", function () {
        failModal.style.display = "none";
    });
}

function activateNotificationSucessModal() {
    const successModal = document.querySelector(".success-modal");

    const close = document.querySelector(".close");
    close.addEventListener("click", function () {
        successModal.style.display = "none";
    });

    const sameChannel = document.querySelector("#same-channel");
    const samePub = document.querySelector("#same-publication");
    const newPub = document.querySelector("#another-publication");
    
    sameChannel.addEventListener("click", function () {
        const msgBody = document.querySelector("#message");
        msgBody.value = null;
        const url = document.querySelector("#url");
        url.value = null;
        document.querySelector("#silent").checked = false;
        const characterCountLabel = document.querySelector("#remaining-characters");
        characterCountLabel.innerText = "40 Characters remaining";
        characterCountLabel.setAttribute("style", "color: #415161;");
        successModal.style.display = "none";
        resetHistory();
        const chosenPub = document.querySelector("#notification h2");
        fillRecentHistoryTable(chosenPub.id);
        const viewAllBtn = document.querySelector(".view-btn");
        viewAllBtn.disabled = false;
    });
    samePub.addEventListener("click", function () {
        const chosenPub = document.querySelector("#chosen-pub .pub-logo").getAttribute("data-site");
        makeInactive("notification");
        makeInactive("history");
        resetNotification();
        resetHistory();
        enable("channel", chosenPub);
        removeExtraInfoDiv();
        removeChosenChannel();
        const sendBtn = document.querySelector("#notification .send-btn");
        sendBtn.disabled = true;
        hideMobile("history");
        hideMobile("notif");
        successModal.style.display = "none";
        let channelHeading = document.querySelector("#channel .channel-heading");
        channelHeading.setAttribute("style", "display: flex");
    });
    newPub.addEventListener("click", function () {
        makeInactive("channel");
        makeInactive("notification");
        makeInactive("history");
        resetPublication();
        resetNotification();
        resetChannel();
        resetHistory();
        enable("publication");
        const sendBtn = document.querySelector("#notification .send-btn");
        sendBtn.disabled = true;
        hideMobile("history");
        hideMobile("notif");
        hideMobile("channel");
        successModal.style.display = "none";
    });
}

function notificationSuccess() {
    const successModal = document.querySelector(".success-modal");
    rearrangeModalContent();
    successModal.style.display = "block";
}

function removeBackToStepTwoBtn() {
    const backBtn = document.querySelector("#notification .return");
    if (backBtn) {
        backBtn.parentElement.removeChild(backBtn);
    }
}

function removeScrollBtn() {
    const scroll = document.querySelector("#notif-align h4");
    if (scroll) {
        scroll.parentElement.removeChild(scroll);
    }
}

function resetNotification() {
    const errorMsg = document.querySelector("#notification .items");

    if (errorMsg) {
        const remainingCharacters = document.querySelector("#remaining-characters");
        remainingCharacters.insertAdjacentHTML("beforebegin", "<textarea class='msg' id='message' disabled maxlength='40' required>");
        const errorMsg = document.querySelector("#notification .items");
        errorMsg.parentElement.removeChild(errorMsg);
    }
    console.log("Need to reset notifications!");
    const msgBody = document.querySelector("#message");
    if (msgBody) {
        msgBody.value = null;
        msgBody.disabled = true;
    }
    const url = document.querySelector("#url");
    url.value = null;
    url.disabled = true;
    document.querySelector("#silent").checked = false;
    removeBackToStepTwoBtn();
    removeScrollBtn();
    const characterCountLabel = document.querySelector("#remaining-characters");
    characterCountLabel.innerText = "40 Characters remaining";
    characterCountLabel.setAttribute("style", "color: #415161;");
    
}

function createBackToStepTwoBtn() {
    const caption = document.querySelector("#notification .align-contents h3");
    const returnToStepTwo = document.createElement("div");
    returnToStepTwo.setAttribute("class", "return");
    returnToStepTwo.innerHTML = "<img class='return-arrow' src='/images/back-arrow.png'>";
    const returnText = document.createElement("h4");
    returnText.setAttribute("class", "return-text");
    returnText.setAttribute("style", "color: #F8BD41;");
    returnText.textContent = "Back to Step 2";
    returnToStepTwo.insertAdjacentElement("beforeend", returnText);

    returnToStepTwo.addEventListener("click", function () {
        console.log("Clicked on back to step 2 button");
        const chosenPub = document.querySelector("#chosen-pub .pub-logo").getAttribute("data-site");
        makeInactive("notification");
        makeInactive("history");
        resetNotification();
        enable("channel", chosenPub);
        removeExtraInfoDiv();
        removeChosenChannel();
        resetHistory();
        const channelHeader = document.querySelector(".channel-heading");
        channelHeader.setAttribute("style", "display: flex");
        if (isMobile()) {
            channelHeader.nextSibling.setAttribute("style", "display: none");
        }
        const mobileHistory = document.querySelector(".notif-history");
        const mobileNotif = document.querySelector("#notification");
        mobileHistory.classList.add("mobile");
        mobileNotif.classList.add("mobile");
    });

    if (isMobile()) {
        moveStepTwoBtn(returnToStepTwo);
        createScrollToHistoryBtn();
    } else {
        caption.insertAdjacentElement("afterend", returnToStepTwo);
    }
}

function createScrollToHistoryBtn() {
    const scroll = document.createElement("h4");
    scroll.className = "remaining-characters";
    scroll.innerText = "Check sent notifications";
    scroll.setAttribute("style", "text-decoration: underline");
    const history = document.querySelector(".notif-history");
    scroll.addEventListener("click", () => history.scrollIntoView());
    const notifCaption = document.getElementById("notif-align");
    notifCaption.insertAdjacentElement("beforeend", scroll);
}
/* Functions relating to the notification sending column */
/*************************************/






/*************************************/
/* Functions relating to the notification history column */
function viewAllNotifications() {
    const fullURL = document.querySelector(".notification-heading").id;
    window.open(`/sent?publication=${fullURL}`);
}

function resetHistory() {
    const tableHeading = document.querySelector(".table-heading-active");
    if (tableHeading && !isMobile()) {
        tableHeading.className = "table-heading-inactive";
    }
    const viewAllBtn = document.querySelector(".view-btn");
    viewAllBtn.disabled = true;
    let table = document.querySelector(".history-table table tbody");
    let filledRows = table.querySelectorAll(".rows-active");
    if (filledRows) {
        filledRows.forEach((r) => table.removeChild(r));
        for (let i = 0; i < 5; i++) {
            let row = document.createElement("tr");
            row.setAttribute("class", "rows-inactive");
            for (let j = 0; j < 4; j++) {
                let cell = document.createElement("td");
                row.appendChild(cell);
            }
            table.appendChild(row);
        }
    }
    
}

function fillRecentHistoryTable(channel) {
    fetch(`/recentHistory?publication=${channel}`)
        .then(res => res.json())
        .then(json => {
            let table = document.querySelector(".history-table table tbody");
            let emptyRows = table.querySelectorAll(".rows-inactive");
            emptyRows.forEach((r) => table.removeChild(r));

            for (let i = 0; i < json.length; i++) {
                let row = document.createElement("tr");
                row.setAttribute("class", "rows-active");
                let notification = json[i];
                let email = notification.Email && notification.Email.S;
                const innerValues = [
                    notification.Body.S,
                    notification.Url.S,
                    new Date(parseInt(notification.Timestamp.N)).toLocaleString('en-GB'),
                    `<a href='mailto:${email}'>${email}</a>`
                ];
                [...Array(4)].map(() => document.createElement("td"))
                    .map((val, index) => {
                        if (index === 3) {
                            val.innerHTML = innerValues[index];
                        } else {
                            val.innerText = innerValues[index];
                        }
                        return val;
                    })
                    .forEach((val) => {
                        row.appendChild(val);
                    });

                table.appendChild(row);
            }
        })
        .catch(function (err) {
            console.log('Fetch Notification History Error :', err);
        });
}

/* Functions relating to the notification history column */
/*************************************/








/*************************************/
/* Functions relating to the mobile design */
function isMobile() {
    let width = parseInt(window.innerWidth);
    return width <= 768;
}

function moveStepOneBtn(stepOneBtn) {
    const channelHeading = document.querySelector("#channel .title");
    const parent = channelHeading.parentElement;
    const number = document.querySelector("#channel .number");

    if (parent.className === "align-contents") {
        console.log("already exists");
        parent.insertAdjacentElement("beforeend", stepOneBtn);
    } else {
        console.log("make new");
        const newHeading = document.createElement("div");
        newHeading.setAttribute("class", "align-contents");
        newHeading.insertAdjacentElement("afterbegin", channelHeading);
        newHeading.insertAdjacentElement("beforeend", stepOneBtn);
        number.insertAdjacentElement("afterend", newHeading);
    }
}

function moveStepTwoBtn(stepTwoBtn) {
    const notificationHeading = document.querySelector("#notification .title");
    const parent = notificationHeading.parentElement;
    const number = document.querySelector("#notification .number");

    if (parent.className === "align-contents") {
        console.log("already exists");
        parent.insertAdjacentElement("beforeend", stepTwoBtn);
    } else {
        console.log("make new");
        const newHeading = document.createElement("div");
        newHeading.setAttribute("class", "align-contents");
        newHeading.insertAdjacentElement("afterbegin", notificationHeading);
        newHeading.insertAdjacentElement("beforeend", stepTwoBtn);
        number.insertAdjacentElement("afterend", newHeading);
    }

}

function rearrangeModalContent() {
    const heading = document.createElement("div");
    heading.setAttribute("style", "display: flex;");
    const text = document.createElement("div");
    text.setAttribute("style", "margin-left: 21px;");

    const tick = document.querySelector(".success-modal .icon");
    const head1 = document.querySelector(".success-modal h1");
    const head2 = document.querySelector(".success-modal h2");
    const exit = document.querySelector(".success-modal .close");
    text.appendChild(head1);
    text.appendChild(head2);
    heading.appendChild(tick);
    heading.appendChild(text);
    exit.insertAdjacentElement("afterend", heading);
}

function hideMobile(section) {
    let makeMobile = "";
    switch (section) {
        case "history":
            makeMobile = document.querySelector(".notif-history");
            break;
        case "notif":
            makeMobile = document.querySelector("#notification");
            break;
        case "channel":
            makeMobile = document.querySelector("#channel");
            break;
    }
    makeMobile.classList.add("mobile");
}
/* Functions relating to the mobile design */
/*************************************/












/*************************************/
/* Functions relating to bookmarking */
function getBookmarks() {
    fetch(`/bookmarks`)
        .then(res => res.json())
        .then(json => {
            const bookmarkListDiv = document.querySelector(".bookmark-list");
            
            while (bookmarkListDiv.firstChild) {
                bookmarkListDiv.removeChild(bookmarkListDiv.firstChild);
            }

            const all = [];
            for (let i = 0; i < json.length; i++) {
                console.log(json[i]);
                const { host, homepage, name, group } = JSON.parse(`${json[i]}`);
                const url = homepage.replace(/^[^\.]+\./, '');
                const outerDiv = document.createElement("div");
                outerDiv.className = "items";
                outerDiv.setAttribute("style", "justify-content: space-between; margin-bottom: 6px;");

                const logoAndText = document.createElement("div");
                logoAndText.setAttribute("class", "logoAndText");

                const text = document.createElement("div");
                text.setAttribute("id", "channel-logo");
                text.setAttribute("class", "pub-logo");
                text.setAttribute("data-publication", url);

                const logo = document.createElement("div");
                logo.setAttribute("id", "channel-options");
                logo.setAttribute("class", "option");
                logo.innerText = name;

                const bookmarkIcon = document.createElement("div");
                bookmarkIcon.innerHTML = "<img class='bookmarkIcon' id='bookmarked' src='/images/bookmark-chosen.png'>";
                bookmarkIcon.addEventListener("click", () => unbookmark(bookmarkIcon));

                logoAndText.appendChild(text);
                logoAndText.appendChild(logo);
                logoAndText.addEventListener("click", () => skipToWritingNotif(logoAndText, homepage, bookmarkIcon));

                outerDiv.appendChild(logoAndText);
                outerDiv.appendChild(bookmarkIcon);
                bookmarkListDiv.appendChild(outerDiv);
                all.push(url);
            }
            window.localStorage.setItem("bookmarks", JSON.stringify(all));
        })
        .catch(function (err) {
            console.log('Fetch Bookmark Error :', err);
        });
}

async function skipToWritingNotif(channel, homepage, bookmarkIcon) {
    const channelItem = document.createElement("div");
    const myChannel = channel.cloneNode(true);
    const myBookmark = bookmarkIcon.cloneNode(true);
    channelItem.setAttribute("class", "items");
    channelItem.setAttribute("id", "channel-items");
    channelItem.appendChild(myChannel);
    channelItem.appendChild(myBookmark);

    changeCaption("channel");
    deleteOtherChannelOptions(channelItem);
    const subs = await getChannelSubCount(homepage);
    addExtraChannelInfo(subs, channelItem);
    enable("notification");
    enable("history", channel, homepage);
    makeInactive("publication");
    storeFullURL(homepage);
}

async function getChannelSubCount(homepage) {
    const resp = await fetch(`/subCount?homepage=${homepage}`);
    const count = await resp.json();
    return count;
}

function unbookmark(icon) {
    const url = icon.previousSibling.firstChild.getAttribute("data-publication");
    const name = icon.previousSibling.innerText;
    console.log(url, name);
    deleteBookmark(url, name);
    getBookmarks();
}

function addNewBookmark(url, name) {
    const details = url + "::" + name;
    fetch(`/addNewBookmark`, {
        method: 'POST',
        mode: 'cors',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            details
        })
    })
        .then((response) => {
            console.log("bookmark adding status: ", response);
        });
}

function deleteBookmark(url, name) {
    const details = url + "::" + name;
    fetch(`/deleteBookmark`, {
        method: 'POST',
        mode: 'cors',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            details
        })
    })
        .then((response) => {
            console.log("bookmark removing status: ", response);
        });
}

function isBookmarked(channel) {
    const allBookmarks = JSON.parse(window.localStorage.getItem("bookmarks"));
    const url = channel.querySelector("#channel-logo").getAttribute("data-publication");
    return allBookmarks.includes(url);
}
/* Functions relating to bookmarking */
/*************************************/