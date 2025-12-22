function estaAutenticado(req, res, siguiente) {
    if (req.isAuthenticated()) {
        return siguiente();
    }
    res.redirect('/login');
}

module.exports = { estaAutenticado };

