function millisToMinutesAndSeconds(millis) {
    const m = Math.floor(millis / 60000);
    const s = ((millis % 60000) / 1000).toFixed(0);
    return `${m}:${(s < 10 ? '0' : '')}${s} (m:s)`;
}

const showInfo = (info, duration) => {
    let message = 'Status Code Counts: \n';
    Object.keys(info).map(key => {
        message += `${key}: ${info[key]} \n`;
    });
    message += `Sent in ${millisToMinutesAndSeconds(duration)}`;
    window.alert(message);
};

const downloadCSV = async (publication) => {
    const notificationHistory = await fetch(`/history?publication=${publication}`);
    const response = await notificationHistory.json();

    //download file
    const a = document.createElement('a');
    const { data, todaysDate } = response;
    a.href = data;
    a.download = `${publication}-${todaysDate}.csv`;
    document.querySelector("body").appendChild(a);
    a.click();
    a.remove();
};