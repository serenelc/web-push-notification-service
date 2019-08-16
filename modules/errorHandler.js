const errorHandler = (req, res) => res.render("error", req.errorObject);

module.exports = { errorHandler };
